import prisma from './prisma.js';
import { resolveAuctionForSlot } from '../controllers/slot.controller.js';
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
