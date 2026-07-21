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
      return res.status(400).json({ success: false, message: 'Slot number must be a positive integer' });
    }
    if (Number.isNaN(parsedPower) || parsedPower <= 0) {
      return res.status(400).json({ success: false, message: 'Power (kW) must be a positive number' });
    }

    const station = await prisma.chargingStation.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!station) return res.status(404).json({ success: false, message: 'Station not found' });
    if (station.status !== 'APPROVED') {
      return res.status(400).json({ success: false, message: 'Station must be approved to add slots' });
    }

    const existing = await prisma.slot.findFirst({
      where: { stationId: station.id, slotNumber: parsedSlot }
    });

    if (existing) return res.status(409).json({ success: false, message: 'Slot number already exists' });

    const slot = await prisma.slot.create({
      data: { stationId: station.id, slotNumber: parsedSlot, powerKw: parsedPower }
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
          select: { id: true, amount: true, priority: true }
        }
      },
      orderBy: { slotNumber: 'asc' }
    });

    res.json({ success: true, data: slots });
  } catch (error) {
    next(error);
  }
};

export const updateSlotStatus = async (req, res, next) => {
  try {
    const { status } = req.body;

    const ALLOWED_STATUSES = ['AVAILABLE', 'OCCUPIED', 'RESERVED', 'MAINTENANCE'];
    if (!status || !ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Status must be one of: ${ALLOWED_STATUSES.join(', ')}`
      });
    }

    const slot = await prisma.slot.findUnique({
      where: { id: req.params.id },
      include: { station: true }
    });

    if (!slot) return res.status(404).json({ success: false, message: 'Slot not found' });
    if (slot.station.ownerId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not your slot' });
    }

    const updated = await prisma.slot.update({
      where: { id: req.params.id },
      data: { status }
    });

    res.json({ success: true, message: 'Slot status updated', data: updated });
  } catch (error) {
    next(error);
  }
};

export const openAuction = async (req, res, next) => {
  try {
    const { durationMinutes = 30 } = req.body;

    const parsed = parseInt(durationMinutes);
    if (Number.isNaN(parsed) || parsed < 1 || parsed > 1440) {
      return res.status(400).json({ success: false, message: 'Duration must be between 1 and 1440 minutes' });
    }

    const slot = await prisma.slot.findUnique({
      where: { id: req.params.id },
      include: { station: true }
    });

    if (!slot) return res.status(404).json({ success: false, message: 'Slot not found' });
    if (slot.station.ownerId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not your slot' });
    }
    if (slot.auctionOpen) {
      return res.status(400).json({ success: false, message: 'Auction already open for this slot' });
    }

    const auctionEnd = new Date(Date.now() + parsed * 60 * 1000);

    const updated = await prisma.slot.update({
      where: { id: req.params.id },
      data: { auctionOpen: true, auctionEnd, status: 'AVAILABLE' }
    });

    getIO()?.to(`slot:${updated.id}`).emit('auction:opened', { slotId: updated.id, auctionEnd });

    res.json({ success: true, message: 'Auction opened', data: updated });
  } catch (error) {
    next(error);
  }
};

/**
 * Core auction-resolution logic, shared by the owner-triggered HTTP handler
 * below and the automatic sweep in utils/auctionExpiry.js. Takes an
 * already-fetched slot (with station + PENDING bids + each bid's user
 * included) and does everything except auth/response formatting.
 *
 * Walks bids in priority order looking for the first bidder who actually has
 * an EV on file — a bid from someone without one can't become a booking, so
 * it shouldn't block the next-highest eligible bidder from winning instead
 * (previously the top bid alone was checked, marked WON regardless, and the
 * booking silently never got created if they had no EV).
 */
// The core auction-resolution algorithm — closeAuction (below) is a thin
// HTTP wrapper around this. Exported separately so utils/auctionExpiry.js's
// scheduled sweep can also resolve an auction whose end time has passed,
// without a station owner needing to manually click "close."
export const resolveAuctionForSlot = async (slot) => {
  if (!slot.bids.length) {
    await prisma.slot.update({
      where: { id: slot.id },
      data: { auctionOpen: false, auctionEnd: null, status: 'AVAILABLE' }
    });
    getIO()?.to(`slot:${slot.id}`).emit('auction:closed', { slotId: slot.id, winner: null });
    return { winner: null, booking: null, reason: 'NO_BIDS' };
  }

  const sortedBids = slot.bids.sort((a, b) => b.priority - a.priority);

  // Walk down from the highest priority score looking for the first bidder
  // who actually has an EV on file — a booking can't be created without
  // one (evId is required), and a bidder can place a bid before ever
  // registering a vehicle. Simply taking sortedBids[0] would crown someone
  // the "winner" and then fail to create their booking; this instead skips
  // ineligible bids so the auction still resolves to a real, working outcome.
  let winner = null;
  let winnerEv = null;
  for (const bid of sortedBids) {
    const ev = await prisma.eV.findFirst({ where: { userId: bid.userId } });
    if (ev) { winner = bid; winnerEv = ev; break; }
  }

  if (!winner) {
    logger.warn(`[closeAuction] Slot ${slot.id} had ${sortedBids.length} bid(s) but no bidder has an EV on file. No winner.`);
    await prisma.slot.update({
      where: { id: slot.id },
      data: { auctionOpen: false, auctionEnd: null, status: 'AVAILABLE' }
    });
    getIO()?.to(`slot:${slot.id}`).emit('auction:closed', { slotId: slot.id, winner: null, reason: 'NO_ELIGIBLE_BIDDER' });
    return { winner: null, booking: null, reason: 'NO_ELIGIBLE_BIDDER' };
  }

  await prisma.bid.update({ where: { id: winner.id }, data: { status: 'WON' } });

  const losers = sortedBids.filter(b => b.id !== winner.id);
  if (losers.length) {
    await prisma.bid.updateMany({
      where: { id: { in: losers.map(b => b.id) } },
      data: { status: 'LOST' }
    });
  }

  const booking = await prisma.booking.create({
    data: {
      userId: winner.userId,
      evId: winnerEv.id,
      slotId: slot.id,
      status: 'CONFIRMED',
      startTime: new Date(),
      totalCost: winner.amount
    }
  });

  await prisma.slot.update({
    where: { id: slot.id },
    data: { auctionOpen: false, auctionEnd: null, status: 'RESERVED' }
  });

  getIO()?.to(`slot:${slot.id}`).emit('auction:closed', { slotId: slot.id, winnerUserId: winner.userId });
  getIO()?.to(`user:${winner.userId}`).emit('auction:won', { slotId: slot.id, stationName: slot.station.name, amount: winner.amount });

  const { subject, html } = emailTemplates.auctionWon(winner.user.name, {
    stationName: slot.station.name,
    slotNumber: slot.slotNumber,
    bidAmount: winner.amount
  });
  sendEmail({ to: winner.user.email, subject, html });

  for (const bid of losers) {
    getIO()?.to(`user:${bid.userId}`).emit('auction:lost', { slotId: slot.id, stationName: slot.station.name });
    const lost = emailTemplates.auctionLost(bid.user.name, { stationName: slot.station.name, slotNumber: slot.slotNumber });
    sendEmail({ to: bid.user.email, subject: lost.subject, html: lost.html });
  }

  return { winner: { ...winner, status: 'WON' }, booking, reason: null };
};

export const closeAuction = async (req, res, next) => {
  try {
    const slot = await prisma.slot.findUnique({
      where: { id: req.params.id },
      include: {
        station: true,
        bids: {
          where: { status: 'PENDING' },
          include: { user: true }
        }
      }
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
      null: 'Auction closed successfully'
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
    const where = { slotId: req.params.id, status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'ACTIVE'] } };

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
      orderBy: { startTime: 'asc' }
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
      include: { station: true }
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
        status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'ACTIVE'] }
      }
    });

    if (activeBooking) {
      return res.status(409).json({
        success: false,
        message: 'Cannot delete a slot that has active or upcoming bookings. Cancel those bookings first.'
      });
    }

    await prisma.slot.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Slot deleted' });
  } catch (error) {
    next(error);
  }
};
