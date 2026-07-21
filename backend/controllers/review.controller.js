import prisma from '../utils/prisma.js';
import { audit } from '../utils/audit.js';

// Shared helper: average + count for a set of stations, computed in one query.
// Used here and by station.controller to decorate cards/detail pages.
export const ratingStatsFor = async (stationIds) => {
  if (!stationIds.length) return {};
  const rows = await prisma.review.findMany({
    where: { stationId: { in: stationIds } },
    select: { stationId: true, rating: true },
  });
  const acc = {};
  for (const r of rows) {
    acc[r.stationId] ??= { sum: 0, count: 0 };
    acc[r.stationId].sum += r.rating;
    acc[r.stationId].count += 1;
  }
  return Object.fromEntries(
    Object.entries(acc).map(([id, { sum, count }]) => [
      id,
      { ratingAvg: Math.round((sum / count) * 10) / 10, ratingCount: count },
    ])
  );
};

/**
 * POST /api/reviews — EV users only, and ONLY with a verified purchase:
 * at least one COMPLETED **and paid** booking at that station. One review
 * per user per station; posting again updates the existing one.
 */
export const upsertReview = async (req, res, next) => {
  try {
    const { stationId, rating, comment } = req.body;

    const station = await prisma.chargingStation.findUnique({ where: { id: stationId } });
    if (!station || station.status !== 'APPROVED') {
      return res.status(404).json({ success: false, message: 'Station not found' });
    }

    // Verified-purchase gate: at least one payment whose booking was a
    // COMPLETED session at this station. One query through the
    // payment -> booking -> slot chain covers every eligible session.
    const paid = await prisma.payment.findFirst({
      where: {
        userId: req.user.id,
        booking: { status: 'COMPLETED', slot: { stationId } },
      },
      select: { id: true },
    });
    if (!paid) {
      return res.status(403).json({
        success: false,
        message:
          'You can only review stations where you have completed and paid for a charging session.',
      });
    }

    const data = { rating: parseInt(rating), comment: comment?.trim() || null };
    const existing = await prisma.review.findFirst({
      where: { userId: req.user.id, stationId },
    });

    const review = existing
      ? await prisma.review.update({ where: { id: existing.id }, data })
      : await prisma.review.create({ data: { userId: req.user.id, stationId, ...data } });

    const stats = (await ratingStatsFor([stationId]))[stationId];

    res.status(existing ? 200 : 201).json({
      success: true,
      message: existing ? 'Review updated' : 'Review posted — thanks for the feedback!',
      data: { review, stats },
    });
  } catch (error) {
    // Compound-unique race (two simultaneous first reviews) surfaces as P2002.
    if (error.code === 'P2002') {
      return res
        .status(409)
        .json({
          success: false,
          message: 'You already have a review for this station — try again to edit it.',
        });
    }
    next(error);
  }
};

// GET /api/reviews/station/:stationId — public: latest reviews + stats.
export const getStationReviews = async (req, res, next) => {
  try {
    const { stationId } = req.params;
    const take = Math.min(parseInt(req.query.limit) || 20, 50);

    const [reviews, stats] = await Promise.all([
      prisma.review.findMany({
        where: { stationId },
        orderBy: { createdAt: 'desc' },
        take,
        include: { user: { select: { id: true, name: true, avatar: true } } },
      }),
      ratingStatsFor([stationId]),
    ]);

    res.json({
      success: true,
      data: reviews,
      stats: stats[stationId] || { ratingAvg: 0, ratingCount: 0 },
    });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/reviews/:id — the author may remove their own review;
// an ADMIN may moderate any review (audited).
export const deleteReview = async (req, res, next) => {
  try {
    const review = await prisma.review.findUnique({ where: { id: req.params.id } });
    if (!review) return res.status(404).json({ success: false, message: 'Review not found' });

    const isOwner = review.userId === req.user.id;
    const isAdmin = req.user.role === 'ADMIN';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Not your review' });
    }

    await prisma.review.delete({ where: { id: req.params.id } });

    if (isAdmin && !isOwner) {
      audit(
        req,
        'REVIEW_DELETED',
        `Moderated a ${review.rating}★ review on station ${review.stationId}`
      );
    }

    res.json({ success: true, message: 'Review deleted' });
  } catch (error) {
    next(error);
  }
};
