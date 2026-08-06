import prisma from './prisma.js';
import {
  resolveAuctionForSlot,
  cascadeExpiredReservation,
  notifyLostBidders,
} from '../controllers/slot.controller.js';
import logger from './logger.js';

// Slot.auctionEnd was previously only ever checked to block new bids after
// the deadline — nothing actually closed the auction, so a slot whose owner
// forgot to click "Close Auction" stayed stuck in auction mode forever.
// This proactive sweep (like the booking check-in/payment timers) resolves
// any auction whose deadline has passed, exactly as if the owner had closed
// it manually.
export const expireEndedAuctions = async () => {
  const ended = await prisma.slot.findMany({
    where: { auctionOpen: true, auctionEnd: { lt: new Date() } },
    include: {
      station: true,
      bids: { where: { status: 'PENDING' }, include: { user: true } },
    },
  });

  for (const slot of ended) {
    try {
      await resolveAuctionForSlot(slot);
    } catch (err) {
      logger.error(`Failed to auto-close auction for slot ${slot.id}:`, err.message);
    }
  }

  if (ended.length) logger.info(`Auto-closed ${ended.length} ended auction(s)`);
  return ended.length;
};

/**
 * Sweeps auction-win bookings (Booking.reservationDeadline is only ever set
 * on those) whose confirmation window passed without the winner checking in,
 * and hands each one off to cascadeExpiredReservation to promote the
 * next-ranked bidder — or close the auction and free the slot if none remain.
 */
export const expireAuctionReservations = async (extraWhere = {}) => {
  const stale = await prisma.booking.findMany({
    where: { status: 'CONFIRMED', reservationDeadline: { lt: new Date() }, ...extraWhere },
    include: {
      user: { select: { name: true, email: true } },
      slot: {
        include: {
          station: true,
          bids: { where: { status: 'PENDING' }, include: { user: true } },
        },
      },
    },
  });

  let processed = 0;
  for (const booking of stale) {
    try {
      const result = await cascadeExpiredReservation(booking);
      if (result.cascaded) processed += 1;
    } catch (err) {
      logger.error(`Failed to cascade expired reservation for booking ${booking.id}:`, err.message);
    }
  }

  if (processed) logger.info(`Processed ${processed} expired auction reservation(s)`);
  return processed;
};

/**
 * Called by booking.controller.js's checkIn once a winner actually confirms
 * their auction-win reservation in time. The auction is now fully resolved,
 * so every other bidder still waiting in the ranked queue for this slot is
 * finalized as LOST and notified — they're no longer needed as backups.
 */
export const finalizeAuctionWinConfirmed = async (slotId) => {
  // Mirror the confirmation onto the durable Auction history row so the
  // owner's Auctions page shows this round as fully resolved, not still
  // "Pending Confirmation".
  const auction = await prisma.auction.findFirst({
    where: { slotId, status: 'COMPLETED' },
    orderBy: { createdAt: 'desc' },
  });
  if (auction) {
    await prisma.auction.update({
      where: { id: auction.id },
      data: { winnerStatus: 'CONFIRMED' },
    });
  }

  const losers = await prisma.bid.findMany({
    where: { slotId, status: 'PENDING', rank: { not: null } },
    include: { user: true },
  });
  if (!losers.length) return;

  await prisma.bid.updateMany({
    where: { id: { in: losers.map((b) => b.id) } },
    data: { status: 'LOST' },
  });

  const slot = await prisma.slot.findUnique({ where: { id: slotId }, include: { station: true } });
  if (slot) notifyLostBidders(slot, losers);
};
