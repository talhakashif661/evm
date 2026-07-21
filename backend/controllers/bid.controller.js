import prisma from '../utils/prisma.js';
import { getIO } from '../utils/socket.js';

/**
 * calculatePriority
 *
 * Priority score = 60% normalized bid amount + 40% battery urgency.
 *
 * IMPORTANT: the bid amount is normalized against a FIXED reference value
 * (REFERENCE_MAX_BID), not the highest bid seen so far. Normalizing against
 * "current max bid" made scores order-dependent - the very first bidder on a
 * slot always scored 1.0 regardless of how small their bid was, since their
 * own bid was both the numerator and the denominator. Using a fixed ceiling
 * means every bid in the auction is judged against the same scale, so
 * rankings stay stable and comparable no matter what order people bid in.
 *
 * @param {number} bidAmount - the bid amount in currency units
 * @param {number} batteryLevel - bidder's current battery percentage (0-100)
 * @param {number} [referenceMax=REFERENCE_MAX_BID] - fixed normalization ceiling
 * @returns {number} priority score, 0-100
 */
// Fixed ceiling: bids at or above this clamp to a normalized 1.0. Was 100 —
// far below a realistic PKR bid for a full charging session (station prices
// run ~40 PKR/kWh, so even a modest session costs several hundred PKR),
// which meant almost every real bid clamped to the same 1.0 and the "60%
// bid" half of the formula stopped differentiating bidders at all in
// practice. env-configurable like the other business constants in this
// codebase (NO_SHOW_MINUTES, PAYMENT_GRACE_MINUTES, ...).
const REFERENCE_MAX_BID = parseInt(process.env.BID_REFERENCE_MAX_PKR || '2000');

export const calculatePriority = (bidAmount, batteryLevel, referenceMax = REFERENCE_MAX_BID) => {
  const normalizedBid = Math.min(bidAmount / referenceMax, 1);
  const batteryUrgency =
    batteryLevel <= 20 ? 1 : batteryLevel <= 40 ? 0.7 : batteryLevel <= 60 ? 0.4 : 0.1;
  return (normalizedBid * 0.6 + batteryUrgency * 0.4) * 100;
};

export const placeBid = async (req, res, next) => {
  try {
    const { slotId, amount, batteryLevel } = req.body;

    if (!slotId || !amount || batteryLevel === undefined) {
      return res
        .status(400)
        .json({ success: false, message: 'Slot, bid amount and battery level are required' });
    }

    const slot = await prisma.slot.findUnique({
      where: { id: slotId },
      include: {
        bids: { where: { status: 'PENDING' } },
        station: { select: { ownerId: true } },
      },
    });

    if (!slot) return res.status(404).json({ success: false, message: 'Slot not found' });
    if (!slot.auctionOpen)
      return res.status(400).json({ success: false, message: 'Slot is not in auction mode' });

    // A station owner bidding on their own auction makes no sense: they set the
    // price, they close the auction, and they'd be "winning" a booking against
    // their own customers. Block it.
    if (slot.station?.ownerId === req.user.id) {
      return res
        .status(403)
        .json({ success: false, message: "You cannot bid on your own station's slot" });
    }

    if (slot.auctionEnd && new Date() > slot.auctionEnd) {
      return res.status(400).json({ success: false, message: 'Auction has ended' });
    }

    const parsedAmount = parseFloat(amount);
    const parsedBattery = parseFloat(batteryLevel);

    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      return res
        .status(400)
        .json({ success: false, message: 'Bid amount must be a positive number' });
    }
    if (Number.isNaN(parsedBattery) || parsedBattery < 0 || parsedBattery > 100) {
      return res
        .status(400)
        .json({ success: false, message: 'Battery level must be between 0 and 100' });
    }

    // Check if user already bid on this slot
    const existingBid = await prisma.bid.findFirst({
      where: { userId: req.user.id, slotId, status: 'PENDING' },
    });

    const priority = calculatePriority(parsedAmount, parsedBattery);

    if (existingBid) {
      const updated = await prisma.bid.update({
        where: { id: existingBid.id },
        data: { amount: parsedAmount, batteryLevel: parsedBattery, priority },
      });

      const leaderboardAfterUpdate = await prisma.bid.findMany({
        where: { slotId, status: 'PENDING' },
        orderBy: { priority: 'desc' },
        select: { id: true, amount: true, priority: true, batteryLevel: true, userId: true },
      });
      getIO()
        ?.to(`slot:${slotId}`)
        .emit('bid:update', { slotId, totalBids: leaderboardAfterUpdate.length });

      return res.json({ success: true, message: 'Bid updated', data: updated });
    }

    const bid = await prisma.bid.create({
      data: {
        userId: req.user.id,
        slotId,
        amount: parsedAmount,
        batteryLevel: parsedBattery,
        priority,
      },
    });

    // The existingBid pre-check above can race: two near-simultaneous
    // requests from the same user can both see "no PENDING bid yet" and both
    // insert, leaving two PENDING bids for the same (userId, slotId).
    // Reconcile the same way createBooking does — re-query, and whoever has
    // the lexicographically smallest id (ObjectIds are totally ordered) is
    // the keeper; the loser deletes its own just-inserted row and 409s so the
    // client retries (which then hits the existingBid update path instead).
    const contenders = await prisma.bid.findMany({
      where: { userId: req.user.id, slotId, status: 'PENDING' },
      select: { id: true },
    });
    if (contenders.length > 1) {
      const winnerId = contenders.map((c) => c.id).sort()[0];
      if (bid.id !== winnerId) {
        await prisma.bid.delete({ where: { id: bid.id } });
        return res
          .status(409)
          .json({
            success: false,
            message: 'You already have a pending bid on this slot — please try again.',
          });
      }
    }

    // Get current leaderboard
    const leaderboard = await prisma.bid.findMany({
      where: { slotId, status: 'PENDING' },
      orderBy: { priority: 'desc' },
      select: { id: true, amount: true, priority: true, batteryLevel: true, userId: true },
    });

    const userRank = leaderboard.findIndex((b) => b.userId === req.user.id) + 1;

    // Let anyone else watching this slot's bids know the leaderboard moved,
    // and nudge the owning station's dashboard too.
    getIO()?.to(`slot:${slotId}`).emit('bid:update', { slotId, totalBids: leaderboard.length });
    getIO()
      ?.to(`station:${slot.stationId}`)
      .emit('bid:new', { slotId, totalBids: leaderboard.length });

    res.status(201).json({
      success: true,
      message: 'Bid placed successfully',
      data: { bid, yourRank: userRank, totalBids: leaderboard.length },
    });
  } catch (error) {
    next(error);
  }
};

// PUBLIC route (bid transparency is intentional — see bid.routes.js) — no
// bidder identity in the response. Amount/priority/battery are enough
// competitive signal without exposing WHO is bidding to anyone on the
// internet; only the bidder's own GET /mine and the station owner's
// dashboard need names, and both go through authenticated endpoints instead.
export const getSlotBids = async (req, res, next) => {
  try {
    const bids = await prisma.bid.findMany({
      where: { slotId: req.params.slotId, status: 'PENDING' },
      orderBy: { priority: 'desc' },
      select: {
        id: true,
        amount: true,
        priority: true,
        batteryLevel: true,
        createdAt: true,
      },
    });

    res.json({ success: true, data: bids });
  } catch (error) {
    next(error);
  }
};

export const getMyBids = async (req, res, next) => {
  try {
    const bids = await prisma.bid.findMany({
      where: { userId: req.user.id },
      include: {
        slot: {
          include: {
            station: { select: { name: true, address: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: bids });
  } catch (error) {
    next(error);
  }
};

export const cancelBid = async (req, res, next) => {
  try {
    const bid = await prisma.bid.findFirst({
      where: { id: req.params.id, userId: req.user.id, status: 'PENDING' },
    });

    if (!bid) return res.status(404).json({ success: false, message: 'Bid not found' });

    await prisma.bid.update({
      where: { id: req.params.id },
      data: { status: 'CANCELLED' },
    });

    res.json({ success: true, message: 'Bid cancelled' });
  } catch (error) {
    next(error);
  }
};

export const getAuctionResults = async (req, res, next) => {
  try {
    const results = await prisma.bid.findMany({
      where: {
        userId: req.user.id,
        status: { in: ['WON', 'LOST'] },
      },
      include: {
        slot: {
          include: {
            station: { select: { name: true, address: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({ success: true, data: results });
  } catch (error) {
    next(error);
  }
};
