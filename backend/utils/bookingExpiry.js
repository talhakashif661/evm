import prisma from './prisma.js';
import { sendEmail, emailTemplates } from './email.js';
import { getIO } from './socket.js';
import logger from './logger.js';
import { expireAuctionReservations } from './auctionExpiry.js';

const NO_SHOW_MINUTES = parseInt(process.env.NO_SHOW_MINUTES || '15');

const round = (value) => Number(value.toFixed(2));

const notify = (booking, status, reason, slotReleased) => {
  const payload = {
    bookingId: booking.id,
    slotId: booking.slotId,
    status,
    reason,
    slotStatus: slotReleased ? 'AVAILABLE' : booking.slot.status,
  };
  const io = getIO();
  io?.to(`user:${booking.userId}`).emit('booking:status-changed', payload);
  io?.to(`user:${booking.slot.station.ownerId}`).emit('booking:expired', payload);
  io?.to(`slot:${booking.slotId}`).emit('slot:availability-changed', payload);
};

/**
 * Atomically claim one still-confirmed booking and release its slot. The
 * status predicate is a distributed lock: only one overlapping scheduler or
 * lazy read-path sweep can claim the row, so notifications are sent once.
 */
const expireBookingAndReleaseSlot = (booking, reason) =>
  prisma.$transaction(async (tx) => {
    const claimed = await tx.booking.updateMany({
      where: { id: booking.id, status: 'CONFIRMED' },
      data: { status: 'CANCELLED', cancelReason: reason },
    });
    if (claimed.count !== 1) return { expired: false, slotReleased: false };

    const released = await tx.slot.updateMany({
      where: {
        id: booking.slotId,
        status: { notIn: ['OFFLINE', 'FAULTED', 'MAINTENANCE'] },
      },
      data: { status: 'AVAILABLE' },
    });
    return { expired: true, slotReleased: released.count === 1 };
  });

// Compatibility wrapper for existing imports. The former bulk update could
// race the notified sweep and silently cancel a booking without releasing its
// slot; every no-show now goes through the single atomic implementation.
export const expireStaleBookings = async (extraWhere = {}) =>
  expireNoShowBookings(extraWhere);

/**
 * Expire unclaimed scheduled (windowed) bookings: 15 minutes after their
 * start time. Auction-win bookings (plannedEndTime null) are never matched
 * here — their confirmation window is the auction's own configured Slot
 * Reservation Time, tracked via reservationDeadline and enforced by
 * utils/auctionExpiry.js's expireAuctionReservations instead, which cascades
 * to the next-ranked bidder rather than just releasing the slot.
 */
export const expireNoShowBookings = async (extraWhere = {}) => {
  const cutoff = new Date(Date.now() - NO_SHOW_MINUTES * 60 * 1000);
  const stale = await prisma.booking.findMany({
    where: {
      status: 'CONFIRMED',
      plannedEndTime: { not: null },
      startTime: { lt: cutoff },
      ...extraWhere,
    },
    include: {
      user: { select: { name: true, email: true } },
      slot: {
        select: {
          status: true,
          slotNumber: true,
          station: {
            select: {
              name: true,
              ownerId: true,
              owner: { select: { name: true, email: true } },
            },
          },
        },
      },
    },
  });

  let expiredCount = 0;
  for (const booking of stale) {
    const reason = 'NO_SHOW';
    const result = await expireBookingAndReleaseSlot(booking, reason);
    if (!result.expired) continue;
    expiredCount += 1;

    const customerEmail = emailTemplates.bookingNoShow(booking.user.name, {
      stationName: booking.slot.station.name,
      slotNumber: booking.slot.slotNumber,
      noShowMinutes: NO_SHOW_MINUTES,
    });
    sendEmail({ to: booking.user.email, ...customerEmail });

    const ownerEmail = emailTemplates.ownerBookingExpired(booking.slot.station.owner.name, {
      customerName: booking.user.name,
      stationName: booking.slot.station.name,
      slotNumber: booking.slot.slotNumber,
      slotReleased: result.slotReleased,
    });
    sendEmail({ to: booking.slot.station.owner.email, ...ownerEmail });
    notify(booking, 'CANCELLED', reason, result.slotReleased);
  }

  if (expiredCount) {
    logger.info(`Auto-cancelled ${expiredCount} no-show booking(s)`);
  }
  return expiredCount;
};

/**
 * A checked-in booking whose payment deadline passed is cancelled. This
 * existing flow remains separate from the scheduled no-show transaction.
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
    const claimed = await prisma.booking.updateMany({
      where: { id: booking.id, status: 'CHECKED_IN' },
      data: { status: 'CANCELLED', cancelReason: 'PAYMENT_TIMEOUT' },
    });
    if (claimed.count !== 1) continue;

    // Physical fault states must win over session churn (same rule as the
    // no-show and completed-session release paths).
    const released = await prisma.slot.updateMany({
      where: {
        id: booking.slotId,
        status: { notIn: ['MAINTENANCE', 'OFFLINE', 'FAULTED'] },
      },
      data: { status: 'AVAILABLE' },
    });

    const email = emailTemplates.bookingPaymentTimeout(booking.user.name, {
      stationName: booking.slot.station.name,
      slotNumber: booking.slot.slotNumber,
    });
    sendEmail({ to: booking.user.email, ...email });
    getIO()?.to(`user:${booking.userId}`).emit('booking:status-changed', {
      bookingId: booking.id,
      status: 'CANCELLED',
      reason: 'PAYMENT_TIMEOUT',
      slotStatus: released.count === 1 ? 'AVAILABLE' : undefined,
    });
    getIO()?.to(`slot:${booking.slotId}`).emit('slot:availability-changed', {
      slotId: booking.slotId,
      slotStatus: released.count === 1 ? 'AVAILABLE' : undefined,
    });
  }

  if (stale.length) {
    logger.info(`Auto-cancelled ${stale.length} payment-timeout booking(s)`);
  }
  return stale.length;
};

/**
 * Auto-complete an ACTIVE (charging) booking once its reserved window
 * (plannedEndTime) has passed — same idea as a customer unplugging right on
 * time. Mirrors the owner's manual completeBooking (booking.controller.js),
 * but ends exactly at plannedEndTime rather than whenever this sweep happens
 * to run, so a slow tick never bills the customer for time it didn't cause.
 * Auction-win bookings (plannedEndTime null) are open-ended and never
 * matched here — they can only be ended via emergency-stop or manual
 * completion, same as expireNoShowBookings above.
 */
export const completeFinishedChargingSessions = async (extraWhere = {}) => {
  const now = new Date();
  const finished = await prisma.booking.findMany({
    where: {
      status: 'ACTIVE',
      plannedEndTime: { not: null, lte: now },
      ...extraWhere,
    },
    include: {
      slot: {
        select: {
          id: true,
          status: true,
          powerKw: true,
          station: { select: { id: true, ownerId: true, pricePerKwh: true } },
        },
      },
    },
  });

  let completedCount = 0;
  for (const booking of finished) {
    const endTime = new Date(booking.plannedEndTime);
    const startedAt = new Date(
      booking.chargingStartedAt || booking.checkInTime || booking.startTime
    );
    const durationHours = Math.max((endTime - startedAt) / 3600000, 0);
    const finalEnergyKwh = round(durationHours * (booking.slot.powerKw || 0));
    const ratePerKwh = booking.ratePerKwh ?? booking.slot.station.pricePerKwh;

    // Status predicate is a distributed lock, same as expireBookingAndReleaseSlot
    // above — only one overlapping scheduler/lazy-sweep can claim this row.
    const claimed = await prisma.booking.updateMany({
      where: { id: booking.id, status: 'ACTIVE' },
      data: {
        status: 'COMPLETED',
        endTime,
        finalEnergyKwh,
        durationMinutes: Math.round(durationHours * 60),
        finalBill: round(finalEnergyKwh * ratePerKwh),
        ratePerKwh,
      },
    });
    if (claimed.count !== 1) continue;
    completedCount += 1;

    // Physical fault states must win over session churn (same rule as the
    // emergency-stop and no-show release paths).
    const released = await prisma.slot.updateMany({
      where: {
        id: booking.slot.id,
        status: { notIn: ['MAINTENANCE', 'OFFLINE', 'FAULTED'] },
      },
      data: { status: 'AVAILABLE' },
    });

    const payload = {
      bookingId: booking.id,
      slotId: booking.slot.id,
      status: 'COMPLETED',
      endTime,
      slotStatus: released.count === 1 ? 'AVAILABLE' : booking.slot.status,
    };
    const io = getIO();
    io?.to(`user:${booking.userId}`).emit('booking:status-changed', payload);
    io?.to(`user:${booking.slot.station.ownerId}`).emit('booking:status-changed', payload);
    io?.to(`slot:${booking.slot.id}`).emit('slot:availability-changed', payload);
  }

  if (completedCount) {
    logger.info(`Auto-completed ${completedCount} finished charging session(s)`);
  }
  return completedCount;
};

export const expireAllStaleBookings = async (extraWhere = {}) => {
  await expireNoShowBookings(extraWhere);
  await expirePaymentTimeouts(extraWhere);
  await expireAuctionReservations(extraWhere);
  await completeFinishedChargingSessions(extraWhere);
};
