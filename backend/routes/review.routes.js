import express from 'express';
import {
  upsertReview,
  getStationReviews,
  getMyReviewForStation,
  deleteReview,
} from '../controllers/review.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { requireVerified } from '../middleware/kyc.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { createReviewRules } from '../validators/reviewValidators.js';

const router = express.Router();

// Public: anyone can read a station's reviews (they also power the star
// averages on station cards).
router.get('/station/:stationId', getStationReviews);

// Logged-in user's own review for this station, independent of whichever
// page of the (now paginated) review list is currently loaded — the review
// form needs to know "edit vs write" and pre-fill regardless of paging.
router.get('/station/:stationId/mine', authenticate, getMyReviewForStation);

// Writing requires a verified EV user; the controller additionally enforces
// the verified-purchase rule (completed + paid session at that station).
router.post(
  '/',
  authenticate,
  authorize('EV_USER'),
  requireVerified(),
  createReviewRules,
  validate,
  upsertReview
);

// Author can delete their own; admin can moderate any (audited).
router.delete('/:id', authenticate, deleteReview);

export default router;
