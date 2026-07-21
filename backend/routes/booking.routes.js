import express from 'express';
import {
  createBooking, getMyBookings, cancelBooking, completeBooking,
  checkIn, createBookingPaymentIntent, ownerCancelBooking
} from '../controllers/booking.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireVerified } from '../middleware/kyc.middleware.js';
import { validate } from '../middleware/validate.js';
import { createBookingRules } from '../validators/bookingValidators.js';

const router = express.Router();

router.use(authenticate);

router.post('/', requireVerified(), createBookingRules, validate, createBooking);
router.get('/', getMyBookings);
router.patch('/:id/cancel', cancelBooking);
router.patch('/:id/check-in', checkIn);
router.post('/:id/payment-intent', createBookingPaymentIntent);
router.patch('/:id/complete', completeBooking);
router.patch('/:id/owner-cancel', ownerCancelBooking);

export default router;
