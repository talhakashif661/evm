import prisma from './prisma.js';
import { sendEmail, emailTemplates } from './email.js';
import { getIO } from './socket.js';
import logger from './logger.js';

const NO_SHOW_MINUTES = parseInt(process.env.NO_SHOW_MINUTES || '15');
// Auction wins have no scheduled startTime window (they're open-ended), so a
// 15-minute arrival cutoff doesn't apply the same way — the winner gets a
// much longer grace period to check in before the slot is freed back up.
const AUCTION_WIN_GRACE_HOURS = parseInt(process.env.AUCTION_WIN_GRACE_HOURS || '2');

const notify = (booking, status, reason) => {
  getIO()
    ?.to(`user:${booking.userId}`)
    .emit('booking:status-changed', { bookingId: booking.id, status, reason });
  getIO()
    ?.to(`slot:${booking.slotId}`)
    .emit('slot:availability-changed', { slotId: booking.slotId });
};

// A CONFIRMED booking whose planned window fully elapsed without the owner
// marking it complete is treated as a no-show and auto-cancelled (no charge),
// instead of sitting as "active" forever. Open-ended bookings (plannedEndTime
// = null, i.e. auction wins) are excluded here on purpose — they're handled
// by expireNoShowBookings' own (much longer) grace period below, since they
// have no scheduled window to have "fully elapsed" in the first place.
// Called lazily from read paths rather than a cron job, matching this
// codebase's existing syncSlotStatus pattern.
export const expireStaleBookings = async (extraWhere = {}) => {
  await prisma.booking.updateMany({
    where: {
      status: { in: ['PENDING', 'CONFIRMED'] },
      plannedEndTime: { not: null, lt: new Date() },
      ...extraWhere,
    },
    data: { status: 'CANCELLED', cancelReason: 'NO_SHOW' },
  });
};

/**
 * Two distinct "never claimed" cases, swept together since both are a
 * CONFIRMED booking nobody checked into:
 *  - windowed bookings: cancelled NO_SHOW_MINUTES after their scheduled startTime.
 *  - open-ended (auction-win) bookings: no scheduled window to be late for, so
 *    they instead get a much longer AUCTION_WIN_GRACE_HOURS from creation —
 *    previously this sweep had no plannedEndTime guard at all, so auction
 *    wins were wrongly getting caught by the 15-minute windowed-booking
 *    cutoff instead.
 * Needs a per-row email + socket notification, so it can't be a bulk updateMany.
 */
export const expireNoShowBookings = async (extraWhere = {}) => {
  const cutoff = new Date(Date.now() - NO_SHOW_MINUTES * 60 * 1000);
  const abandonedCutoff = new Date(Date.now() - AUCTION_WIN_GRACE_HOURS * 60 * 60 * 1000);
  const stale = await prisma.booking.findMany({
    where: {
      status: 'CONFIRMED',
      OR: [
        { plannedEndTime: { not: null }, startTime: { lt: cutoff } },
        { plannedEndTime: null, startTime: { lt: abandonedCutoff } },
      ],
      ...extraWhere,
    },
    include: {
      user: { select: { name: true, email: true } },
      slot: { select: { slotNumber: true, station: { select: { name: true } } } },
    },
  });

  for (const booking of stale) {
    const isAuctionWin = !booking.plannedEndTime;
    const reason = isAuctionWin ? 'AUCTION_WIN_ABANDONED' : 'NO_SHOW';
    await prisma.booking.update({
      where: { id: booking.id },
      data: { status: 'CANCELLED', cancelReason: reason },
    });

    const template = isAuctionWin ? emailTemplates.auctionWinExpired : emailTemplates.bookingNoShow;
    const { subject, html } = template(booking.user.name, {
      stationName: booking.slot.station.name,
      slotNumber: booking.slot.slotNumber,
      noShowMinutes: NO_SHOW_MINUTES,
    });
    sendEmail({ to: booking.user.email, subject, html });
    notify(booking, 'CANCELLED', reason);
  }

  if (stale.length) logger.info(`Auto-cancelled ${stale.length} no-show/abandoned booking(s)`);
  return stale.length;
};

/**
 * A CHECKED_IN booking whose paymentDeadline has passed without a completed
 * payment is cancelled, freeing the slot immediately for other users.
 */
export const expirePaymentTimeouts = async (extraWhere = {}) => {
  const now = new Date();
  const stale = await prisma.booking.findMany({
    where: { status: 'CHECKED_IN', paymentDeadline: { lt: now }, ...extraWhere },
    include: {
      user: { select: { name: true, email: true } },
      slot: { select: { slotNumber: true, station: { select: { name: true } } } },
    },
  });

  for (const booking of stale) {
    await prisma.booking.update({
      where: { id: booking.id },
      data: { status: 'CANCELLED', cancelReason: 'PAYMENT_TIMEOUT' },
    });

    const { subject, html } = emailTemplates.bookingPaymentTimeout(booking.user.name, {
      stationName: booking.slot.station.name,
      slotNumber: booking.slot.slotNumber,
    });
    sendEmail({ to: booking.user.email, subject, html });
    notify(booking, 'CANCELLED', 'PAYMENT_TIMEOUT');
  }

  if (stale.length) logger.info(`Auto-cancelled ${stale.length} payment-timeout booking(s)`);
  return stale.length;
};

/** Runs all three sweeps together — the single call read paths should use. */
export const expireAllStaleBookings = async (extraWhere = {}) => {
  await expireStaleBookings(extraWhere);
  await expireNoShowBookings(extraWhere);
  await expirePaymentTimeouts(extraWhere);
};
