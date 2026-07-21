import express from 'express';
import prisma from '../utils/prisma.js';
import { authenticate } from '../middleware/auth.middleware.js';
import stripe from '../utils/stripe.js';
import { activateBookingPayment } from '../utils/paymentActivation.js';
import { getIO } from '../utils/socket.js';
import logger from '../utils/logger.js';

// Mounted separately in app.js, BEFORE the global express.json() parser —
// Stripe's signature check needs the exact raw request bytes, which are gone
// by the time a request reaches this router (mounted after express.json()).
// This is why it's exported standalone instead of living as another route
// inside the router below.
export const stripeWebhook = async (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    logger.error('Stripe webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === 'payment_intent.succeeded') {
      const intent = event.data.object;
      const bookingId = intent.metadata?.bookingId;
      if (!bookingId) return res.json({ received: true });

      // activateBookingPayment is itself scoped to CHECKED_IN bookings with no
      // existing Payment row, so a booking that's already ACTIVE/COMPLETED/
      // CANCELLED, or a retried/out-of-order webhook delivery, is a safe no-op.
      await activateBookingPayment({
        bookingId,
        method: 'STRIPE',
        stripePaymentIntentId: intent.id,
      });
    } else if (event.type === 'payment_intent.payment_failed') {
      const intent = event.data.object;
      const bookingId = intent.metadata?.bookingId;
      if (bookingId) {
        const booking = await prisma.booking.findUnique({
          where: { id: bookingId },
          select: { userId: true },
        });
        // Booking stays CHECKED_IN — the user can retry within the remaining
        // grace period (expirePaymentTimeouts will cancel it if they don't).
        if (booking) getIO()?.to(`user:${booking.userId}`).emit('payment:failed', { bookingId });
      }
    }
    res.json({ received: true });
  } catch (err) {
    logger.error('Stripe webhook handler error:', err.message);
    res.status(500).json({ received: false });
  }
};

const router = express.Router();

router.use(authenticate);

// The old POST /pay/:bookingId "simulate payment" endpoint has been retired.
// Every booking pays exclusively through POST /bookings/:id/payment-intent
// (booking.controller.js), which is ALWAYS a server-side decision:
//   - live mode: the client confirms the returned clientSecret with Stripe,
//     and only the webhook above (Stripe's servers calling us back) flips
//     the booking to ACTIVE.
//   - mock mode (utils/stripe.js's isMockPayments, local dev with no real
//     Stripe key): the endpoint itself calls activateBookingPayment directly
//     after a simulated delay, since there's no real Stripe to webhook back.
// Neither path lets the client just assert "I paid" — that self-service
// shortcut is what was removed.

router.get('/history', async (req, res, next) => {
  try {
    const payments = await prisma.payment.findMany({
      where: { userId: req.user.id },
      include: {
        booking: {
          include: { slot: { include: { station: { select: { name: true } } } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: payments });
  } catch (e) {
    next(e);
  }
});

// transactionId here is stripePaymentIntentId — either a real Stripe
// PaymentIntent id (live mode) or the pi_mock_* id generated in
// createBookingPaymentIntent (mock mode). Scoped to the requester's own
// payments unless they're an admin, same rule as /history.
router.get('/status/:transactionId', async (req, res, next) => {
  try {
    const payment = await prisma.payment.findFirst({
      where: {
        stripePaymentIntentId: req.params.transactionId,
        ...(req.user.role === 'ADMIN' ? {} : { userId: req.user.id }),
      },
    });
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
    res.json({ success: true, data: payment });
  } catch (e) {
    next(e);
  }
});

export default router;
