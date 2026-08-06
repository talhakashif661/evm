import prisma from '../utils/prisma.js';
import { getIO } from '../utils/socket.js';
import { sendEmail, emailTemplates } from '../utils/email.js';
import logger from '../utils/logger.js';

export const addSlot = async (req, res, next) => {
  try {
    const { slotNumber, powerKw } = req.body;

    const parsedSlot = parseInt(slotNumber);
    const parsedPower = parseFloat(powerKw);

    if (!Number.isInteger(parsedSlot) || parsedSlot < 1) {
      return res
        .status(400)
        .json({ success: false, message: 'Slot number must be a positive integer' });
    }
    if (Number.isNaN(parsedPower) || parsedPower <= 0) {
      return res
        .status(400)
        .json({ success: false, message: 'Power (kW) must be a positive number' });
    }

    const station = await prisma.chargingStation.findUnique({
      where: { ownerId: req.user.id },
    });

    if (!station) return res.status(404).json({ success: false, message: 'Station not found' });
    if (station.status !== 'APPROVED') {
      return res
        .status(400)
        .json({ success: false, message: 'Station must be approved to add slots' });
    }

    const existing = await prisma.slot.findFirst({
      where: { stationId: station.id, slotNumber: parsedSlot },
    });

    if (existing)
      return res.status(409).json({ success: false, message: 'Slot number already exists' });

    const slot = await prisma.slot.create({
      data: { stationId: station.id, slotNumber: parsedSlot, powerKw: parsedPower },
    });

    res.status(201).json({ success: true, message: 'Slot added', data: slot });
  } catch (error) {
    next(error);
  }
};

export const getStationSlots = async (req, res, next) => {
  try {
    const slots = await prisma.slot.findMany({
      where: { stationId: req.params.stationId },
      include: {
        bids: {
          where: { status: 'PENDING' },
          orderBy: { priority: 'desc' },
          take: 5,
          select: { id: true, amount: true, priority: true },
        },
      },
      orderBy: { slotNumber: 'asc' },
    });

    res.json({ success: true, data: slots });
  } catch (error) {
    next(error);
  }
};

export const updateSlotStatus = async (req, res, next) => {
  try {
    const { status } = req.body;

    const ALLOWED_STATUSES = [
      'AVAILABLE',
      'OCCUPIED',
      'RESERVED',
      'MAINTENANCE',
      'OFFLINE',
      'FAULTED',
    ];
    if (!status || !ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Status must be one of: ${ALLOWED_STATUSES.join(', ')}`,
      });
    }

    const slot = await prisma.slot.findUnique({
      where: { id: req.params.id },
      include: { station: true },
    });

    if (!slot) return res.status(404).json({ success: false, message: 'Slot not found' });
    if (slot.station.ownerId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not your slot' });
    }

    const updated = await prisma.slot.update({
      where: { id: req.params.id },
      data: { status },
    });

    res.json({ success: true, message: 'Slot status updated', data: updated });
  } catch (error) {
    next(error);
  }
};

// Default reservation window when a slot's own auctionReservationMinutes
// somehow isn't set (defensive only — openAuction below requires it).
const DEFAULT_RESERVATION_MINUTES = parseInt(
  process.env.AUCTION_RESERVATION_DEFAULT_MINUTES || '10'
);

export const openAuction = async (req, res, next) => {
  try {
    const { durationMinutes = 30, startingBid, minIncrement, reservationMinutes } = req.body;

    const parsed = parseInt(durationMinutes);
    if (Number.isNaN(parsed) || parsed < 1 || parsed > 1440) {
      return res
        .status(400)
        .json({ success: false, message: 'Duration must be between 1 and 1440 minutes' });
    }

    const parsedStartingBid = parseFloat(startingBid);
    if (Number.isNaN(parsedStartingBid) || parsedStartingBid <= 0) {
      return res
        .status(400)
        .json({ success: false, message: 'Starting bid price must be a positive number' });
    }

    let parsedMinIncrement = null;
    if (minIncrement !== undefined && minIncrement !== null && minIncrement !== '') {
      parsedMinIncrement = parseFloat(minIncrement);
      if (Number.isNaN(parsedMinIncrement) || parsedMinIncrement < 0) {
        return res
          .status(400)
          .json({ success: false, message: 'Minimum bid increment must be a non-negative number' });
      }
    }

    const parsedReservationMinutes = parseInt(reservationMinutes);
    if (Number.isNaN(parsedReservationMinutes) || parsedReservationMinutes < 1 || parsedReservationMinutes > 1440) {
      return res.status(400).json({
        success: false,
        message: 'Slot reservation time must be between 1 and 1440 minutes',
      });
    }

    const slot = await prisma.slot.findUnique({
      where: { id: req.params.id },
      include: { station: true },
    });

    if (!slot) return res.status(404).json({ success: false, message: 'Slot not found' });
    if (slot.station.ownerId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not your slot' });
    }
    if (slot.auctionOpen) {
      return res
        .status(400)
        .json({ success: false, message: 'Auction already open for this slot' });
    }

    const auctionEnd = new Date(Date.now() + parsed * 60 * 1000);

    const updated = await prisma.slot.update({
      where: { id: req.params.id },
      data: {
        auctionOpen: true,
        auctionEnd,
        status: 'AVAILABLE',
        auctionStartingBid: parsedStartingBid,
        auctionMinIncrement: parsedMinIncrement,
        auctionReservationMinutes: parsedReservationMinutes,
      },
    });

    // Durable per-round history record — see the Auction model's comment.
    // Slot's own auction* fields above only ever reflect this CURRENT round;
    // this row is what lets the owner's Auctions page show past rounds too.
    await prisma.auction.create({
      data: {
        slotId: updated.id,
        startingBid: parsedStartingBid,
        minIncrement: parsedMinIncrement,
        reservationMinutes: parsedReservationMinutes,
        auctionEnd,
        status: 'ACTIVE',
      },
    });

    getIO()?.to(`slot:${updated.id}`).emit('auction:opened', {
      slotId: updated.id,
      auctionEnd,
      startingBid: parsedStartingBid,
      minIncrement: parsedMinIncrement,
      reservationMinutes: parsedReservationMinutes,
    });

    res.json({ success: true, message: 'Auction opened', data: updated });
  } catch (error) {
    next(error);
  }
};

/**
 * Notifies a batch of bidders that they lost the auction (or forfeited by
 * not confirming). Callers must have already set each bid's status to LOST
 * and included `user` on each bid. Shared by the ineligible-bidder rejection
 * in resolveAuctionForSlot and the final exhaustion in
 * cascadeExpiredReservation/checkIn.
 */
export const notifyLostBidders = (slot, bids) => {
  for (const bid of bids) {
    getIO()
      ?.to(`user:${bid.userId}`)
      .emit('auction:lost', { slotId: slot.id, stationName: slot.station.name });
    const lost = emailTemplates.auctionLost(bid.user.name, {
      stationName: slot.station.name,
      slotNumber: slot.slotNumber,
    });
    sendEmail({ to: bid.user.email, subject: lost.subject, html: lost.html });
  }
};

/**
 * Creates the reservation booking for one ranked bid and notifies them. Used
 * both for the initial auction winner (resolveAuctionForSlot) and for
 * promoting the next-ranked bidder after a reservation expires unclaimed
 * (cascadeExpiredReservation, in utils/auctionExpiry.js). Requires `slot` to
 * include `station`, and `bid` to include `user`. `auction` (the durable
 * per-round Auction row, optional) gets its winnerId/winnerStatus updated to
 * reflect whoever is being offered the reservation right now.
 */
export const offerReservationToBid = async (slot, bid, ev, auction) => {
  await prisma.bid.update({ where: { id: bid.id }, data: { status: 'WON' } });

  const reservationMinutes = slot.auctionReservationMinutes ?? DEFAULT_RESERVATION_MINUTES;
  const reservationDeadline = new Date(Date.now() + reservationMinutes * 60 * 1000);

  const booking = await prisma.booking.create({
    data: {
      userId: bid.userId,
      evId: ev.id,
      slotId: slot.id,
      status: 'CONFIRMED',
      startTime: new Date(),
      totalCost: bid.amount,
      reservationDeadline,
    },
  });

  await prisma.slot.update({
    where: { id: slot.id },
    data: { status: 'RESERVED' },
  });

  if (auction) {
    await prisma.auction.update({
      where: { id: auction.id },
      data: {
        status: 'COMPLETED',
        // Preserve the original close time across cascade re-offers instead
        // of resetting it every time a new bidder is offered the slot.
        closedAt: auction.closedAt ?? new Date(),
        winnerId: bid.userId,
        winnerStatus: 'PENDING_CONFIRMATION',
      },
    });
  }

  getIO()
    ?.to(`slot:${slot.id}`)
    .emit('auction:closed', { slotId: slot.id, winnerUserId: bid.userId });
  getIO()?.to(`user:${bid.userId}`).emit('auction:won', {
    slotId: slot.id,
    stationName: slot.station.name,
    amount: bid.amount,
    reservationDeadline,
  });

  const { subject, html } = emailTemplates.auctionWon(bid.user.name, {
    stationName: slot.station.name,
    slotNumber: slot.slotNumber,
    bidAmount: bid.amount,
    reservationMinutes,
  });
  sendEmail({ to: bid.user.email, subject, html });

  return { winner: { ...bid, status: 'WON' }, booking, reason: null };
};

/**
 * Core auction-resolution logic, shared by the owner-triggered HTTP handler
 * below and the automatic sweep in utils/auctionExpiry.js. Takes an
 * already-fetched slot (with station + PENDING bids + each bid's user
 * included) and does everything except auth/response formatting.
 *
 * Ranks bids by priority, skipping any bidder with no EV on file (a booking
 * can't be created without one — they're marked LOST immediately, since
 * they can never become eligible for this auction's cascade). Every
 * remaining eligible bid gets a `rank` (1 = best) so that if the top-ranked
 * bidder's reservation later expires unclaimed, cascadeExpiredReservation
 * knows exactly who to offer it to next, in order — repeating until someone
 * confirms or the ranked list is exhausted.
 */
// The core auction-resolution algorithm — closeAuction (below) is a thin
// HTTP wrapper around this. Exported separately so utils/auctionExpiry.js's
// scheduled sweep can also resolve an auction whose end time has passed,
// without a station owner needing to manually click "close."
export const resolveAuctionForSlot = async (slot) => {
  // The durable history row for this round — created in openAuction. Every
  // status/winner transition below is mirrored onto it so the owner's
  // Auctions page reflects the outcome even after auctionOpen flips false.
  const auction = await prisma.auction.findFirst({
    where: { slotId: slot.id, status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
  });

  if (!slot.bids.length) {
    await prisma.slot.update({
      where: { id: slot.id },
      data: { auctionOpen: false, auctionEnd: null, status: 'AVAILABLE' },
    });
    if (auction) {
      await prisma.auction.update({
        where: { id: auction.id },
        data: { status: 'CANCELLED', closedAt: new Date(), winnerStatus: 'NO_WINNER' },
      });
    }
    getIO()?.to(`slot:${slot.id}`).emit('auction:closed', { slotId: slot.id, winner: null });
    return { winner: null, booking: null, reason: 'NO_BIDS' };
  }

  const sortedBids = [...slot.bids].sort((a, b) => b.priority - a.priority);

  // Walk down from the highest priority score, keeping only bidders who
  // actually have an EV on file — a booking can't be created without one
  // (evId is required), and a bidder can place a bid before ever registering
  // a vehicle. Ineligible bids are dropped from the ranking entirely (marked
  // LOST below) so the cascade never tries to offer the slot to someone who
  // can't accept it.
  const eligible = [];
  const ineligible = [];
  for (const bid of sortedBids) {
    const ev = await prisma.eV.findFirst({ where: { userId: bid.userId } });
    if (ev) eligible.push({ bid, ev });
    else ineligible.push(bid);
  }

  if (ineligible.length) {
    await prisma.bid.updateMany({
      where: { id: { in: ineligible.map((b) => b.id) } },
      data: { status: 'LOST' },
    });
    notifyLostBidders(slot, ineligible);
  }

  if (!eligible.length) {
    logger.warn(
      `[closeAuction] Slot ${slot.id} had ${sortedBids.length} bid(s) but no bidder has an EV on file. No winner.`
    );
    await prisma.slot.update({
      where: { id: slot.id },
      data: { auctionOpen: false, auctionEnd: null, status: 'AVAILABLE' },
    });
    if (auction) {
      await prisma.auction.update({
        where: { id: auction.id },
        data: { status: 'CANCELLED', closedAt: new Date(), winnerStatus: 'NO_WINNER' },
      });
    }
    getIO()
      ?.to(`slot:${slot.id}`)
      .emit('auction:closed', { slotId: slot.id, winner: null, reason: 'NO_ELIGIBLE_BIDDER' });
    return { winner: null, booking: null, reason: 'NO_ELIGIBLE_BIDDER' };
  }

  // Assign rank (1 = best) to every eligible bid, in priority order — this is
  // the queue cascadeExpiredReservation walks if the leader never confirms.
  await Promise.all(
    eligible.map(({ bid }, index) =>
      prisma.bid.update({ where: { id: bid.id }, data: { rank: index + 1 } })
    )
  );

  // Bidding stops now (auctionOpen false), but the slot itself only becomes
  // RESERVED once offerReservationToBid creates the top bidder's booking.
  await prisma.slot.update({
    where: { id: slot.id },
    data: { auctionOpen: false, auctionEnd: null },
  });

  return offerReservationToBid(slot, eligible[0].bid, eligible[0].ev, auction);
};

/**
 * Called when a winner's reservation deadline passes without them checking
 * in (see utils/auctionExpiry.js's expireAuctionReservations sweep). Cancels
 * their booking, forfeits their bid, and offers the reservation to the
 * next-ranked eligible bidder still waiting — repeating this same cascade on
 * every subsequent expiry until someone confirms. If the ranked list is
 * exhausted with no one confirming, the auction closes for good and the slot
 * reverts to AVAILABLE so it can be booked or auctioned again.
 *
 * `booking` must include `user` and `slot` (with `slot.station` and
 * `slot.bids` — the still-PENDING ranked bids for that slot).
 */
export const cascadeExpiredReservation = async (booking) => {
  // Atomically claim this booking so a concurrent sweep run (or a check-in
  // racing the same row) can't process the same expiry twice.
  const claimed = await prisma.booking.updateMany({
    where: { id: booking.id, status: 'CONFIRMED' },
    data: { status: 'CANCELLED', cancelReason: 'AUCTION_RESERVATION_EXPIRED' },
  });
  if (claimed.count !== 1) return { cascaded: false };

  const slot = booking.slot;
  const auction = await prisma.auction.findFirst({
    where: { slotId: slot.id },
    orderBy: { createdAt: 'desc' },
  });

  // The expired winner's own bid forfeits — they had it and didn't confirm.
  // EXPIRED (not LOST) distinguishes "won, then didn't show up" from bids
  // that were simply outranked, for the owner's Auctions page.
  await prisma.bid.updateMany({
    where: { slotId: slot.id, userId: booking.userId, status: 'WON' },
    data: { status: 'EXPIRED' },
  });
  if (auction) {
    await prisma.auction.update({
      where: { id: auction.id },
      data: { winnerStatus: 'EXPIRED' },
    });
  }

  getIO()?.to(`user:${booking.userId}`).emit('booking:status-changed', {
    bookingId: booking.id,
    slotId: slot.id,
    status: 'CANCELLED',
    reason: 'AUCTION_RESERVATION_EXPIRED',
  });
  const expiredEmail = emailTemplates.auctionWinExpired(booking.user.name, {
    stationName: slot.station.name,
    slotNumber: slot.slotNumber,
  });
  sendEmail({ to: booking.user.email, ...expiredEmail });

  // Next-ranked bidder still waiting, in rank order.
  const remaining = slot.bids
    .filter((b) => b.rank != null && b.userId !== booking.userId)
    .sort((a, b) => a.rank - b.rank);

  // Bids skipped along the way (bidder no longer has an EV on file) — they
  // forfeit too, just like the expired winner, and get the same "lost"
  // notification once we know whether anyone further down accepted it.
  const skipped = [];
  for (const bid of remaining) {
    const ev = await prisma.eV.findFirst({ where: { userId: bid.userId } });
    if (!ev) {
      // Shouldn't normally happen (eligibility was checked at close time),
      // but if they deleted their EV since bidding, they can't accept it.
      await prisma.bid.update({ where: { id: bid.id }, data: { status: 'LOST' } });
      skipped.push(bid);
      continue;
    }
    notifyLostBidders(slot, skipped);
    const result = await offerReservationToBid(slot, bid, ev, auction);
    return { cascaded: true, ...result };
  }

  // Ranked queue exhausted — no one left to offer it to. Close the auction
  // for good; every bid in `remaining` was either offered above (and this
  // function would already have returned) or already marked LOST into `skipped`.
  notifyLostBidders(slot, skipped);
  await prisma.slot.update({
    where: { id: slot.id },
    data: { status: 'AVAILABLE' },
  });
  if (auction) {
    await prisma.auction.update({
      where: { id: auction.id },
      data: { status: 'CANCELLED', winnerId: null, winnerStatus: 'NO_WINNER' },
    });
  }
  getIO()?.to(`slot:${slot.id}`).emit('auction:closed', {
    slotId: slot.id,
    winner: null,
    reason: 'ALL_RESERVATIONS_EXPIRED',
  });

  return { cascaded: true, winner: null, booking: null, reason: 'ALL_RESERVATIONS_EXPIRED' };
};

export const closeAuction = async (req, res, next) => {
  try {
    const slot = await prisma.slot.findUnique({
      where: { id: req.params.id },
      include: {
        station: true,
        bids: {
          where: { status: 'PENDING' },
          include: { user: true },
        },
      },
    });

    if (!slot) return res.status(404).json({ success: false, message: 'Slot not found' });
    if (slot.station.ownerId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not your slot' });
    }
    if (!slot.auctionOpen) {
      return res.status(400).json({ success: false, message: 'No auction is open for this slot' });
    }

    const result = await resolveAuctionForSlot(slot);

    const messages = {
      NO_BIDS: 'Auction closed - no bids',
      NO_ELIGIBLE_BIDDER: 'Auction closed — no bidder has a registered EV, no winner selected.',
      null: 'Auction closed successfully',
    };
    res.json({ success: true, message: messages[result.reason ?? 'null'], data: result });
  } catch (error) {
    next(error);
  }
};

/**
 * Booked windows for a slot — backs both the live date/time availability
 * picker (pass ?date=YYYY-MM-DD) and the per-slot "upcoming bookings" list
 * (omit date, returns everything current/future).
 */
export const getSlotAvailability = async (req, res, next) => {
  try {
    const { date } = req.query;
    const where = {
      slotId: req.params.id,
      status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'ACTIVE'] },
    };

    if (date) {
      const dayStart = new Date(`${date}T00:00:00`);
      const dayEnd = new Date(`${date}T23:59:59.999`);
      if (Number.isNaN(dayStart.getTime())) {
        return res.status(400).json({ success: false, message: 'Invalid date' });
      }
      // A booking's window overlaps this day if it starts before day-end AND
      // (is open-ended OR ends after day-start).
      where.startTime = { lt: dayEnd };
      where.OR = [{ plannedEndTime: null }, { plannedEndTime: { gt: dayStart } }];
    } else {
      where.OR = [{ plannedEndTime: null }, { plannedEndTime: { gt: new Date() } }];
    }

    const bookings = await prisma.booking.findMany({
      where,
      select: { id: true, startTime: true, plannedEndTime: true },
      orderBy: { startTime: 'asc' },
    });

    res.json({ success: true, data: bookings });
  } catch (error) {
    next(error);
  }
};

export const deleteSlot = async (req, res, next) => {
  try {
    const slot = await prisma.slot.findUnique({
      where: { id: req.params.id },
      include: { station: true },
    });

    if (!slot) return res.status(404).json({ success: false, message: 'Slot not found' });
    if (slot.station.ownerId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not your slot' });
    }

    // Guard: never delete a slot that has active/upcoming bookings — doing so
    // would cascade-delete those bookings and payments with no notification to the user.
    const activeBooking = await prisma.booking.findFirst({
      where: {
        slotId: req.params.id,
        status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'ACTIVE'] },
      },
    });

    if (activeBooking) {
      return res.status(409).json({
        success: false,
        message:
          'Cannot delete a slot that has active or upcoming bookings. Cancel those bookings first.',
      });
    }

    await prisma.slot.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Slot deleted' });
  } catch (error) {
    next(error);
  }
};
