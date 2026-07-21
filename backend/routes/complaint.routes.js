import express from 'express';
import rateLimit from 'express-rate-limit';
import {
  createComplaint,
  getComplaints,
  deleteComplaint,
} from '../controllers/complaint.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.js';
import { createComplaintRules } from '../validators/complaintValidators.js';

const router = express.Router();

// The submit endpoint is public (guests can complain too), so it gets its own
// tight spam limiter on top of the general API limiter.
const complaintLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many complaints from this device. Please try again in an hour.',
  },
});

router.post('/', complaintLimiter, createComplaintRules, validate, createComplaint);

// Admin inbox
router.get('/', authenticate, authorize('ADMIN'), getComplaints);
router.delete('/:id', authenticate, authorize('ADMIN'), deleteComplaint);

export default router;
