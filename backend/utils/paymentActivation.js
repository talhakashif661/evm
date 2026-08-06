import prisma from './prisma.js';
import { getIO } from './socket.js';
import { audit } from './audit.js';

// Shared by the real Stripe webhook (payment_intent.succeeded, in
// payment.routes.js) and the local mock-payment path (createBookingPaymentIntent
// in booking.controller.js, active when utils/stripe.js's isMockPayments is
// true). Both call this because both represent the SERVER independently
// confirming a booking is paid — never a client-reported "I paid" claim,
// which is the self-service shortcut that was deliberately removed from this
// codebase (see the retired-endpoint note in payment.routes.js).
//
// Idempotent: scoped to CHECKED_IN bookings with no existing Payment row, so
// a retried webhook delivery or a duplicate call is a safe no-op.
export const activateBookingPayment = async ({ bookingId, method, stripePaymentIntentId }) => {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, status: 'CHECKED_IN' },
    include: { slot: { select: { stationId: true } } },
  });
  if (!booking) return null;

  const existing = await prisma.payment.findUnique({ where: { bookingId } });
  if (existing) return null;

  const payment = await prisma.payment.create({
    data: {
      userId: booking.userId,
      bookingId,
      amount: booking.totalCost,
      status: 'COMPLETED',
      method,
      stripePaymentIntentId,
    },
  });
  await prisma.booking.update({
    where: { id: bookingId },
    data: { status: 'ACTIVE', chargingStartedAt: new Date() },
  });
  await prisma.chargingStation.update({
    where: { id: booking.slot.stationId },
    data: { totalRevenue: { increment: booking.totalCost } },
  });

  getIO()?.to(`user:${booking.userId}`).emit('payment:confirmed', { bookingId });
  getIO()
    ?.to(`user:${booking.userId}`)
    .emit('booking:status-changed', { bookingId, status: 'ACTIVE' });
  getIO()
    ?.to(`slot:${booking.slotId}`)
    .emit('slot:availability-changed', { slotId: booking.slotId });
  audit(
    { user: { id: booking.userId }, ip: null },
    'PAYMENT_COMPLETED',
    `${method} payment ${stripePaymentIntentId} for booking ${bookingId}`
  );

  return payment;
};
