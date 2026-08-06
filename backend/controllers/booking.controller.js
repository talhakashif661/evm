import prisma from '../utils/prisma.js';
import { sendEmail, emailTemplates } from '../utils/email.js';
import { expireAllStaleBookings } from '../utils/bookingExpiry.js';
import { getIO } from '../utils/socket.js';
import { audit } from '../utils/audit.js';
import { finalizeAuctionWinConfirmed } from '../utils/auctionExpiry.js';
import logger from '../utils/logger.js';
import stripe, {
  toStripeAmount,
  STRIPE_CURRENCY,
  isMockPayments,
  MOCK_PAYMENT_DELAY_MS,
} from '../utils/stripe.js';
import { activateBookingPayment } from '../utils/paymentActivation.js';
import { clampBattery, estimateBatteryAfter } from '../utils/battery.js';

// Bookings are TIME WINDOWS [startTime, plannedEndTime) instead of an
// open-ended lock on the slot. That means several users can book the SAME
// slot for different, non-overlapping windows — the old model reserved a slot
// from booking creation until the owner completed it, so a slot with a
// booking tomorrow was unusable today. Auction-won bookings (created in
// slot.controller) keep plannedEndTime = null (open-ended — there's no
// scheduled window to reflect), but otherwise flow through the EXACT SAME
// lifecycle as windowed bookings below, including real check-in and payment.
//
// Every booking now flows: CONFIRMED -> CHECKED_IN -> ACTIVE -> COMPLETED.
// Windowed bookings have NO_SHOW_MINUTES after startTime to check in (else
// auto-cancelled); auction wins instead carry their own reservationDeadline,
// set from the station owner's configured Slot Reservation Time when the
// auction was opened — miss it and the reservation cascades to the
// next-ranked bidder instead of just releasing the slot (see
// utils/auctionExpiry.js). Either way, once checked in the customer has
// PAYMENT_GRACE_MINUTES to pay (else auto-cancelled). totalCost is locked in
// at check-in — from the originally-selected duration for windowed bookings,
// or from the winning bid amount as-is for auction wins (the bid was never
// tied to a duration/energy estimate, so it simply IS the price). completeBooking
// only accepts ACTIVE (paid) bookings and only ever tracks *overage* beyond
// that locked-in figure, never recomputes it downward.

const NO_SHOW_MINUTES = parseInt(process.env.NO_SHOW_MINUTES || '15');
const PAYMENT_GRACE_MINUTES = parseInt(process.env.PAYMENT_GRACE_MINUTES || '5');

const round = (value) => Number(value.toFixed(2));

const LIVE = ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'ACTIVE'];

/**
 * Recompute a slot's AVAILABLE/RESERVED status from whether any live booking
 * window covers "now". Never touches OCCUPIED/MAINTENANCE — those are set
 * manually by the owner and shouldn't be overwritten by booking churn.
 */
export const syncSlotStatus = async (slotId) => {
  const now = new Date();
  const activeNow = await prisma.booking.findFirst({
    where: {
      slotId,
      status: { in: LIVE },
      startTime: { lte: now },
      OR: [{ plannedEndTime: null }, { plannedEndTime: { gt: now } }],
    },
    select: { id: true },
  });
  await prisma.slot.updateMany({
    where: { id: slotId, status: { in: ['AVAILABLE', 'RESERVED'] } },
    data: { status: activeNow ? 'RESERVED' : 'AVAILABLE' },
  });
};

export const createBooking = async (req, res, next) => {
  try {
    const { slotId, evId, startTime, durationMinutes } = req.body;

    if (!slotId || !evId || !startTime) {
      return res
        .status(400)
        .json({ success: false, message: 'Slot, EV and start time are required' });
    }

    const start = new Date(startTime);
    if (Number.isNaN(start.getTime())) {
      return res
        .status(400)
        .json({ success: false, message: 'Start time must be a valid date/time' });
    }
    // Small grace window so "book starting now" doesn't fail while the user
    // fills in the form, but far-past bookings are rejected.
    if (start.getTime() < Date.now() - 10 * 60 * 1000) {
      return res.status(400).json({ success: false, message: 'Start time cannot be in the past' });
    }

    const duration = durationMinutes === undefined ? 60 : parseInt(durationMinutes);
    if (Number.isNaN(duration) || duration < 15 || duration > 1440) {
      return res
        .status(400)
        .json({ success: false, message: 'Duration must be between 15 and 1440 minutes' });
    }
    const plannedEnd = new Date(start.getTime() + duration * 60 * 1000);

    const ev = await prisma.eV.findFirst({ where: { id: evId, userId: req.user.id } });
    if (!ev) return res.status(404).json({ success: false, message: 'EV not found' });

    const slot = await prisma.slot.findUnique({
      where: { id: slotId },
      include: { station: true },
    });

    if (!slot) return res.status(404).json({ success: false, message: 'Slot not found' });
    // A RESERVED slot just means someone is booked *right now* — a future
    // window on the same slot is exactly what this feature enables, so only
    // hard physical states block booking outright.
    if (['MAINTENANCE', 'OFFLINE', 'FAULTED', 'OCCUPIED'].includes(slot.status)) {
      return res.status(400).json({
        success: false,
        message: `Slot is currently ${slot.status.toLowerCase()} — please pick another slot`,
      });
    }
    if (slot.auctionOpen) {
      return res
        .status(400)
        .json({ success: false, message: 'This slot is in auction mode — please bid instead' });
    }
    if (slot.station.status !== 'APPROVED') {
      return res.status(400).json({ success: false, message: 'Station not approved' });
    }

    // Two live windows [a1,a2) and [b1,b2) overlap iff a1 < b2 AND a2 > b1.
    // Legacy/auction bookings with plannedEndTime = null are treated as
    // open-ended: they conflict with everything after their start.
    const overlapWhere = {
      slotId,
      status: { in: LIVE },
      startTime: { lt: plannedEnd },
      OR: [{ plannedEndTime: null }, { plannedEndTime: { gt: start } }],
    };

    // Friendly pre-check with a useful message (tells the user WHEN the slot
    // is taken so they can pick a different window, not just "no").
    const conflict = await prisma.booking.findFirst({
      where: overlapWhere,
      orderBy: { startTime: 'asc' },
      select: { startTime: true, plannedEndTime: true },
    });
    if (conflict) {
      const until = conflict.plannedEndTime
        ? ` until ${new Date(conflict.plannedEndTime).toLocaleString()}`
        : ' (open-ended)';
      return res.status(409).json({
        success: false,
        message: `Slot is already booked from ${new Date(conflict.startTime).toLocaleString()}${until}. Please choose a different time window.`,
      });
    }

    // The pre-check can still race: two simultaneous requests for overlapping
    // windows can both pass it. So: optimistically INSERT, then re-query all
    // live overlapping bookings for this window. Both racers see both rows;
    // the one whose booking has the lexicographically smallest id keeps it
    // (ObjectIds give a total order), the other deletes its own row and 409s.
    // Deterministic on both sides, no lock needed, works on MongoDB.
    const booking = await prisma.booking.create({
      data: {
        userId: req.user.id,
        evId,
        slotId,
        status: 'CONFIRMED',
        startTime: start,
        plannedEndTime: plannedEnd,
      },
      include: { slot: { include: { station: true } } },
    });

    const contenders = await prisma.booking.findMany({
      where: overlapWhere,
      select: { id: true },
    });
    if (contenders.length > 1) {
      const winnerId = contenders.map((c) => c.id).sort()[0];
      if (booking.id !== winnerId) {
        await prisma.booking.delete({ where: { id: booking.id } });
        return res.status(409).json({
          success: false,
          message:
            'That time window was just taken by another booking. Please pick another window.',
        });
      }
    }

    // Reflect "busy right now" on the slot card if this window already started.
    await syncSlotStatus(slotId);

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { name: true, email: true },
    });
    const { subject, html } = emailTemplates.bookingConfirmed(user.name, {
      stationName: booking.slot.station.name,
      slotNumber: booking.slot.slotNumber,
      startTime: `${start.toLocaleString()} → ${plannedEnd.toLocaleString()}`,
    });
    sendEmail({ to: user.email, subject, html });

    res.status(201).json({ success: true, message: 'Booking confirmed', data: booking });
  } catch (error) {
    next(error);
  }
};

export const getMyBookings = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const skip = (Math.max(parseInt(page) || 1, 1) - 1) * Math.min(parseInt(limit) || 10, 100);
    const take = Math.min(parseInt(limit) || 10, 100);

    await expireAllStaleBookings({ userId: req.user.id });

    const where = {
      userId: req.user.id,
      ...(status && { status }),
    };

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        include: {
          ev: { select: { model: true, licensePlate: true, batteryPercentage: true } },
          slot: {
            include: {
              station: { select: { name: true, address: true, city: true, pricePerKwh: true } },
            },
          },
          payment: true,
        },
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.booking.count({ where }),
    ]);

    res.json({
      success: true,
      data: bookings,
      pagination: { page: parseInt(page) || 1, limit: take, total, pages: Math.ceil(total / take) },
    });
  } catch (error) {
    next(error);
  }
};

export const cancelBooking = async (req, res, next) => {
  try {
    const booking = await prisma.booking.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    // CHECKED_IN is included: no payment exists yet at that stage (payment
    // only happens once the customer confirms and pays), so this needs no
    // refund handling — unlike a cancel after ACTIVE, which isn't offered
    // here and must go through the owner (see ownerCancelBooking).
    if (!['PENDING', 'CONFIRMED', 'CHECKED_IN'].includes(booking.status)) {
      return res.status(400).json({ success: false, message: 'Cannot cancel this booking' });
    }

    await prisma.booking.update({
      where: { id: req.params.id },
      data: { status: 'CANCELLED', cancelReason: 'USER_CANCELLED' },
    });

    // Another live booking window may cover "now", so recompute instead of
    // blindly flipping the slot to AVAILABLE.
    await syncSlotStatus(booking.slotId);
    getIO()
      ?.to(`slot:${booking.slotId}`)
      .emit('slot:availability-changed', { slotId: booking.slotId });

    res.json({ success: true, message: 'Booking cancelled' });
  } catch (error) {
    next(error);
  }
};

/**
 * Customer confirms arrival at the station. Must happen within NO_SHOW_MINUTES
 * of startTime (checked defensively here too, in case the periodic sweep in
 * server.js hasn't caught up yet). Lets them swap which EV they're charging,
 * then locks in totalCost from the duration already chosen at booking time
 * and starts the payment-deadline clock — charging itself only begins once
 * the resulting PaymentIntent succeeds (see createPaymentIntent + the Stripe
 * webhook in payment.routes.js).
 */
export const checkIn = async (req, res, next) => {
  try {
    const { evId } = req.body;
    const booking = await prisma.booking.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: { slot: { include: { station: true } } },
    });

    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    if (booking.status !== 'CONFIRMED') {
      return res.status(400).json({
        success: false,
        message: 'This booking cannot be checked in from its current state',
      });
    }

    // Windowed bookings must be claimed within NO_SHOW_MINUTES of their
    // scheduled start (checked defensively here too, in case the periodic
    // sweep hasn't caught up yet). Auction-win bookings instead carry their
    // own per-auction reservationDeadline (set from the station owner's
    // configured Slot Reservation Time) — past it, the reservation cascades
    // to the next-ranked bidder (utils/auctionExpiry.js's expireAuctionReservations).
    if (booking.plannedEndTime) {
      const noShowCutoff = new Date(
        new Date(booking.startTime).getTime() + NO_SHOW_MINUTES * 60 * 1000
      );
      if (new Date() > noShowCutoff) {
        return res
          .status(400)
          .json({ success: false, message: 'The check-in window for this booking has expired' });
      }
    } else if (booking.reservationDeadline && new Date() > new Date(booking.reservationDeadline)) {
      return res.status(400).json({
        success: false,
        message: 'Your reservation window has expired and the slot was offered to the next bidder',
      });
    }

    let actualEvId = booking.evId;
    let chargingEv;
    if (evId && evId !== booking.evId) {
      const ev = await prisma.eV.findFirst({ where: { id: evId, userId: req.user.id } });
      if (!ev) return res.status(404).json({ success: false, message: 'EV not found' });
      actualEvId = evId;
      chargingEv = ev;
    } else {
      chargingEv = await prisma.eV.findUnique({ where: { id: booking.evId } });
    }
    // Snapshot the charging EV's current battery % — this is what Usage
    // Analytics later compares against batteryAfter to show battery gained.
    const batteryBefore = chargingEv ? clampBattery(chargingEv.batteryPercentage) : null;

    // Windowed bookings: lock in cost from the originally-selected duration.
    // Auction wins: the winning bid, already stored as totalCost when the
    // auction closed, IS the final price — use it as-is.
    const totalCost = booking.plannedEndTime
      ? parseFloat(
          (
            ((new Date(booking.plannedEndTime) - new Date(booking.startTime)) / 3600000) *
            (booking.slot.powerKw || 0) *
            booking.slot.station.pricePerKwh
          ).toFixed(2)
        )
      : booking.totalCost;

    const now = new Date();
    // Guard the write as well as the read. If the no-show transaction claims
    // this row between lookup and write, check-in cannot resurrect it.
    const claimed = await prisma.booking.updateMany({
      where: { id: req.params.id, userId: req.user.id, status: 'CONFIRMED' },
      data: {
        status: 'CHECKED_IN',
        checkInTime: now,
        actualEvId,
        paymentDeadline: new Date(now.getTime() + PAYMENT_GRACE_MINUTES * 60 * 1000),
        totalCost,
        batteryBefore,
      },
    });
    if (claimed.count !== 1) {
      return res
        .status(409)
        .json({ success: false, message: 'The check-in window for this booking has expired' });
    }
    const updated = await prisma.booking.findUnique({ where: { id: req.params.id } });

    // Auction win, now confirmed in time — the auction is fully resolved, so
    // every other ranked bidder still waiting as a backup is finalized LOST.
    if (booking.reservationDeadline) {
      finalizeAuctionWinConfirmed(booking.slotId).catch((err) =>
        logger.error(`Failed to finalize auction backups for slot ${booking.slotId}:`, err.message)
      );
    }

    getIO()
      ?.to(`slot:${booking.slotId}`)
      .emit('slot:availability-changed', { slotId: booking.slotId });
    getIO()
      ?.to(`user:${req.user.id}`)
      .emit('booking:status-changed', { bookingId: booking.id, status: 'CHECKED_IN' });

    res.json({
      success: true,
      message: 'Checked in — please complete payment to begin charging',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Creates a Stripe PaymentIntent for a checked-in booking's locked-in
 * totalCost. The frontend confirms it with Stripe Elements using the
 * returned clientSecret; the webhook in payment.routes.js is what actually
 * flips the booking to ACTIVE once Stripe confirms the charge succeeded.
 *
 * In mock mode (no real Stripe key configured, see utils/stripe.js), this
 * short-circuits: no PaymentIntent is created and no clientSecret is
 * returned (data.mock is true instead) — the booking is instead activated
 * directly, server-side, before responding.
 */
export const createBookingPaymentIntent = async (req, res, next) => {
  try {
    const booking = await prisma.booking.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.status !== 'CHECKED_IN') {
      return res
        .status(400)
        .json({ success: false, message: 'This booking is not awaiting payment' });
    }
    if (new Date() > new Date(booking.paymentDeadline)) {
      return res
        .status(400)
        .json({ success: false, message: 'The payment window for this booking has expired' });
    }
    if (!booking.totalCost) {
      return res.status(400).json({ success: false, message: 'No amount to pay' });
    }

    // Local dev with no real Stripe key: skip Stripe entirely and have the
    // server confirm its own simulated payment (after a short artificial
    // delay, MOCK_PAYMENT_DELAY_MS, so the frontend's loading state is
    // visible instead of resolving suspiciously instantly). This is still a
    // server-side decision, not a client-reported "I paid" — the same trust
    // boundary the real webhook enforces, see the comment in payment.routes.js.
    if (isMockPayments) {
      const mockIntentId = `pi_mock_${booking.id}_${Date.now()}`;
      await prisma.booking.update({
        where: { id: booking.id },
        data: { paymentIntentId: mockIntentId },
      });
      if (MOCK_PAYMENT_DELAY_MS > 0)
        await new Promise((resolve) => setTimeout(resolve, MOCK_PAYMENT_DELAY_MS));
      await activateBookingPayment({
        bookingId: booking.id,
        method: 'MOCK',
        stripePaymentIntentId: mockIntentId,
      });
      return res.json({
        success: true,
        data: { clientSecret: null, amount: booking.totalCost, mock: true },
      });
    }

    // Reuse a still-open PaymentIntent instead of minting a new one on every
    // call — a double-click, a retried request, or two open tabs on the same
    // booking used to create two separate Stripe PaymentIntents, risking a
    // double charge if both got confirmed.
    if (booking.paymentIntentId) {
      const existing = await stripe.paymentIntents.retrieve(booking.paymentIntentId);
      if (
        [
          'requires_payment_method',
          'requires_confirmation',
          'requires_action',
          'processing',
        ].includes(existing.status)
      ) {
        return res.json({
          success: true,
          data: { clientSecret: existing.client_secret, amount: booking.totalCost },
        });
      }
      // Existing intent is terminal (e.g. a prior card was declined) — fall
      // through and create a genuinely new one for this retry.
    }

    const intent = await stripe.paymentIntents.create({
      amount: toStripeAmount(booking.totalCost),
      currency: STRIPE_CURRENCY,
      metadata: { bookingId: booking.id, userId: req.user.id },
    });

    await prisma.booking.update({
      where: { id: booking.id },
      data: { paymentIntentId: intent.id },
    });

    res.json({
      success: true,
      data: { clientSecret: intent.client_secret, amount: booking.totalCost },
    });
  } catch (error) {
    next(error);
  }
};

export const completeBooking = async (req, res, next) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: { slot: { include: { station: true } }, ev: true, actualEv: true },
    });

    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    // FIX: Only the station OWNER (or admin) can mark a booking as complete.
    // Previously ANY user could complete their own booking, letting them end
    // the session after 1 second and pay near-zero cost.
    const isStationOwner = booking.slot.station.ownerId === req.user.id;
    const isAdmin = req.user.role === 'ADMIN';

    if (!isStationOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Only the station owner can complete a booking',
      });
    }

    // Only ACTIVE (paid) bookings can be completed — every booking, windowed
    // or auction-won, must reach ACTIVE via a real Stripe payment first.
    // Completing straight from CONFIRMED/CHECKED_IN used to be allowed as an
    // auction-booking fallback and was a real bug: it let an owner skip
    // check-in and payment entirely for ANY booking, not just auction wins.
    if (booking.status !== 'ACTIVE') {
      return res.status(400).json({
        success: false,
        message: 'Booking cannot be completed until it has been paid (status must be ACTIVE)',
      });
    }

    const endTime = new Date();
    const durationHours = Math.max((endTime - new Date(booking.startTime)) / 3600000, 0);
    const energyUsed = durationHours * (booking.slot.powerKw || 0);

    // totalCost was already locked in at check-in — from the
    // originally-selected duration for windowed bookings, or the winning bid
    // as-is for auction wins — and is never reduced or recomputed here. Only
    // extra usage beyond a windowed booking's paid-for plannedEndTime is
    // billed, as a separate overage; auction wins (plannedEndTime null) never
    // accrue overage since there's no planned window to run past.
    const totalCost = booking.totalCost;
    let overageAmount = null;
    if (booking.plannedEndTime && endTime > new Date(booking.plannedEndTime)) {
      const overageHours = (endTime - new Date(booking.plannedEndTime)) / 3600000;
      overageAmount = parseFloat(
        (overageHours * (booking.slot.powerKw || 0) * booking.slot.station.pricePerKwh).toFixed(2)
      );
    }

    // Persisted (not just returned in the response below) so the owner's
    // Session Details view — and anything else reading the booking later —
    // has real duration/energy figures for every completed session, not
    // just ones that went through the emergency-stop path (the only other
    // place these two columns were ever written before this fix).
    const durationMinutes = Math.round(durationHours * 60);
    const finalEnergyKwh = parseFloat(energyUsed.toFixed(2));

    // Estimate battery gained from energy delivered vs. the EV's rated
    // capacity (no real telemetry exists — see utils/battery.js), then
    // reflect it back onto the EV so "My EVs" shows an up-to-date level.
    const chargingEv = booking.actualEv || booking.ev;
    const batteryAfter = estimateBatteryAfter(booking.batteryBefore, finalEnergyKwh, chargingEv?.batteryCapacity);

    await prisma.booking.update({
      where: { id: req.params.id },
      data: {
        status: 'COMPLETED',
        endTime,
        totalCost,
        overageAmount,
        durationMinutes,
        finalEnergyKwh,
        batteryAfter,
      },
    });
    if (batteryAfter != null && chargingEv) {
      await prisma.eV.update({ where: { id: chargingEv.id }, data: { batteryPercentage: batteryAfter } });
    }

    await syncSlotStatus(booking.slotId);
    getIO()
      ?.to(`slot:${booking.slotId}`)
      .emit('slot:availability-changed', { slotId: booking.slotId });

    // Revenue is credited when the user actually pays (see payment.routes.js),
    // not here — completion alone isn't money collected. Overage is a
    // separate follow-up payment, collected through the same pay flow.

    res.json({
      success: true,
      message: 'Booking completed',
      data: { totalCost, overageAmount, energyUsed: energyUsed.toFixed(2) },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Station owner (or admin) cancels a booking outright. If the user already
 * paid, this issues a Stripe refund and symmetrically decrements the
 * station's totalRevenue (the exact gap flagged when revenue-crediting was
 * moved to payment time — refunds now exist, so it's no longer hypothetical).
 *
 * An ACTIVE booking is mid-charge, not just reserved — totalCost was paid
 * upfront for the *whole* window, so cancelling it isn't "nothing happened":
 * refunding the full amount would hand back energy the customer already
 * drew. Only the unused remainder (totalCost minus what actual elapsed
 * charging time has billed so far) is refunded here, same computation and
 * same reasoning as the emergency-stop path in chargingSession.controller.js.
 * CONFIRMED/CHECKED_IN bookings never started charging, so those still get a
 * full refund.
 */
export const ownerCancelBooking = async (req, res, next) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: {
        slot: { include: { station: true } },
        user: { select: { name: true, email: true } },
        payment: true,
      },
    });

    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    const isStationOwner = booking.slot.station.ownerId === req.user.id;
    const isAdmin = req.user.role === 'ADMIN';
    if (!isStationOwner && !isAdmin) {
      return res
        .status(403)
        .json({ success: false, message: 'Only the station owner can cancel this booking' });
    }

    if (!['CONFIRMED', 'CHECKED_IN', 'ACTIVE'].includes(booking.status)) {
      return res
        .status(400)
        .json({ success: false, message: 'Booking cannot be cancelled in its current state' });
    }

    const wasCharging = booking.status === 'ACTIVE';
    const endTime = new Date();
    let usage = null;
    if (wasCharging) {
      const startedAt = new Date(
        booking.chargingStartedAt || booking.checkInTime || booking.startTime
      );
      const durationHours = Math.max((endTime - startedAt) / 3600000, 0);
      const finalEnergyKwh = round(durationHours * (booking.slot.powerKw || 0));
      const ratePerKwh = booking.ratePerKwh ?? booking.slot.station.pricePerKwh;
      usage = {
        durationMinutes: Math.round(durationHours * 60),
        finalEnergyKwh,
        finalBill: round(finalEnergyKwh * ratePerKwh),
        ratePerKwh,
      };
    }

    let refunded = false;
    let refundAmount = null;
    if (booking.payment?.status === 'COMPLETED') {
      // Charging already in progress: only the unused portion of the
      // upfront payment is refundable — the rest paid for energy already
      // delivered. Not yet charging: nothing was consumed, refund it all.
      const leftover =
        wasCharging && booking.totalCost != null
          ? round(Math.min(Math.max(booking.totalCost - usage.finalBill, 0), booking.payment.amount))
          : booking.payment.amount;

      if (leftover > 0) {
        // Mock-mode payments carry a fake pi_mock_* id (still truthy) — only a
        // real STRIPE-method payment has an id Stripe's API will recognize.
        if (booking.payment.method === 'STRIPE' && booking.payment.stripePaymentIntentId) {
          await stripe.refunds.create({
            payment_intent: booking.payment.stripePaymentIntentId,
            amount: toStripeAmount(leftover),
          });
        }
        const fullyRefunded = leftover >= booking.payment.amount;
        await prisma.payment.update({
          where: { id: booking.payment.id },
          data: {
            status: fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
            refundedAmount: leftover,
          },
        });
        await prisma.chargingStation.update({
          where: { id: booking.slot.stationId },
          data: { totalRevenue: { decrement: leftover } },
        });
        refundAmount = leftover;
        refunded = true;
      }
    }

    await prisma.booking.update({
      where: { id: req.params.id },
      data: {
        status: 'CANCELLED',
        cancelReason: 'OWNER_CANCELLED',
        ...(usage && { endTime, ...usage }),
      },
    });

    await syncSlotStatus(booking.slotId);

    const { subject, html } = emailTemplates.bookingOwnerCancelled(booking.user.name, {
      stationName: booking.slot.station.name,
      slotNumber: booking.slot.slotNumber,
      finalBill: usage?.finalBill ?? null,
      refundAmount,
    });
    sendEmail({ to: booking.user.email, subject, html });

    getIO()?.to(`user:${booking.userId}`).emit('booking:status-changed', {
      bookingId: booking.id,
      status: 'CANCELLED',
      reason: 'OWNER_CANCELLED',
    });
    getIO()
      ?.to(`slot:${booking.slotId}`)
      .emit('slot:availability-changed', { slotId: booking.slotId });

    audit(
      req,
      'BOOKING_OWNER_CANCELLED',
      `Cancelled booking ${booking.id} for ${booking.user.email}${refundAmount ? ` (refunded ${refundAmount})` : ''}`
    );

    res.json({ success: true, message: 'Booking cancelled', data: { refunded, refundAmount } });
  } catch (error) {
    next(error);
  }
};
