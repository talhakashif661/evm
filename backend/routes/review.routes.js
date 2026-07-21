import express from 'express';
import { upsertReview, getStationReviews, deleteReview } from '../controllers/review.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { requireVerified } from '../middleware/kyc.middleware.js';
import { validate } from '../middleware/validate.js';
import { createReviewRules } from '../validators/reviewValidators.js';

const router = express.Router();

// Public: anyone can read a station's reviews (they also power the star
// averages on station cards).
router.get('/station/:stationId', getStationReviews);

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
