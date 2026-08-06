import prisma from '../utils/prisma.js';
import { parsePagination, paginationMeta } from '../utils/pagination.js';

// Per-bid "confirmation status" shown on the owner's Auctions page — derived
// from the bid's own status plus, for the currently-winning bid, the
// Auction's live winnerStatus (since a WON bid's confirmation state changes
// over time without the bid row itself changing).
const confirmationStatusFor = (bid, auction) => {
  switch (bid.status) {
    case 'WON':
      return auction?.winnerStatus === 'CONFIRMED' ? 'Confirmed' : 'Pending Confirmation';
    case 'EXPIRED':
      return 'Expired (No Response)';
    case 'LOST':
      return 'Not Selected';
    case 'CANCELLED':
      return 'Withdrawn';
    case 'PENDING':
      return 'Awaiting Auction Close';
    default:
      return '—';
  }
};

const summarizeAuction = (auction) => {
  const amounts = auction.bids.map((b) => b.amount);
  return {
    id: auction.id,
    slotId: auction.slotId,
    slotNumber: auction.slot.slotNumber,
    powerKw: auction.slot.powerKw,
    startingBid: auction.startingBid,
    minIncrement: auction.minIncrement,
    reservationMinutes: auction.reservationMinutes,
    auctionEnd: auction.auctionEnd,
    status: auction.status,
    winnerId: auction.winnerId,
    winnerName: auction.winner?.name || null,
    winnerStatus: auction.winnerStatus,
    closedAt: auction.closedAt,
    createdAt: auction.createdAt,
    currentHighestBid: amounts.length ? Math.max(...amounts) : null,
    totalBids: auction.bids.length,
  };
};

/**
 * Every auction round (Active/Completed/Cancelled) across all of the owner's
 * slots — backs the dedicated Auctions page. Optional ?status= filters to
 * just one bucket; omit it to get everything and let the frontend bucket
 * into tabs (mirrors the pattern AuctionHub already uses for EV users).
 */
export const getOwnerAuctions = async (req, res, next) => {
  try {
    const station = await prisma.chargingStation.findUnique({
      where: { ownerId: req.user.id },
    });
    if (!station) return res.status(404).json({ success: false, message: 'Station not found' });

    const { status } = req.query;
    const { page, limit, skip } = parsePagination(req.query);
    const where = {
      slot: { stationId: station.id },
      ...(status && ['ACTIVE', 'COMPLETED', 'CANCELLED'].includes(status) ? { status } : {}),
    };

    const [auctions, total] = await Promise.all([
      prisma.auction.findMany({
        where,
        include: {
          slot: { select: { slotNumber: true, powerKw: true } },
          winner: { select: { name: true } },
          bids: { select: { id: true, amount: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.auction.count({ where }),
    ]);

    res.json({
      success: true,
      data: auctions.map(summarizeAuction),
      pagination: paginationMeta(total, page, limit),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * All bids for one auction round, ranked by priority — the owner's "View
 * Bids" action. Unlike the public GET /bids/slot/:slotId (bid transparency
 * endpoint, deliberately anonymous), this is an authenticated owner-only
 * view and does include bidder names.
 */
export const getAuctionBids = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);

    const auction = await prisma.auction.findUnique({
      where: { id: req.params.id },
      include: {
        slot: { include: { station: { select: { ownerId: true, name: true } } } },
        winner: { select: { name: true } },
        // Unpaginated on purpose — summarizeAuction needs every bid's amount
        // to compute currentHighestBid/totalBids for the WHOLE auction, not
        // just the current page. Lightweight (id+amount only), unlike the
        // full bidder-detail list fetched separately below.
        bids: { select: { id: true, amount: true } },
      },
    });

    if (!auction) return res.status(404).json({ success: false, message: 'Auction not found' });
    if (auction.slot.station.ownerId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not your auction' });
    }

    const [pagedBids, total] = await Promise.all([
      prisma.bid.findMany({
        where: { auctionId: auction.id },
        include: { user: { select: { name: true } } },
        orderBy: { priority: 'desc' },
        skip,
        take: limit,
      }),
      prisma.bid.count({ where: { auctionId: auction.id } }),
    ]);

    const bids = pagedBids.map((bid, index) => ({
      id: bid.id,
      rank: skip + index + 1,
      userName: bid.user.name,
      amount: bid.amount,
      batteryLevel: bid.batteryLevel,
      priority: bid.priority,
      createdAt: bid.createdAt,
      status: bid.status,
      confirmationStatus: confirmationStatusFor(bid, auction),
    }));

    res.json({
      success: true,
      data: {
        auction: summarizeAuction(auction),
        bids,
      },
      pagination: paginationMeta(total, page, limit),
    });
  } catch (error) {
    next(error);
  }
};
