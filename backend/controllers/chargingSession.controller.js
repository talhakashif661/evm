import prisma from '../utils/prisma.js';
import { getIO } from '../utils/socket.js';
import { audit } from '../utils/audit.js';
import stripe, { toStripeAmount } from '../utils/stripe.js';
import { sendEmail, emailTemplates } from '../utils/email.js';
import { estimateBatteryAfter } from '../utils/battery.js';

const round = (value) => Number(value.toFixed(2));

const sessionStart = (booking) =>
  new Date(
    booking.chargingStartedAt || booking.checkInTime || booking.startTime || booking.updatedAt
  );

const liveMetrics = (booking, now = new Date()) => {
  const startedAt = sessionStart(booking);
  const durationMs = Math.max(now.getTime() - startedAt.getTime(), 0);
  const durationMinutes = Math.floor(durationMs / 60000);
  const energyKwh = round((durationMs / 3600000) * (booking.slot.powerKw || 0));
  const ratePerKwh = booking.ratePerKwh ?? booking.slot.station.pricePerKwh;
  return {
    startedAt,
    durationMinutes,
    energyKwh,
    ratePerKwh,
    currentBill: round(energyKwh * ratePerKwh),
  };
};

const sessionSelect = {
  id: true,
  status: true,
  startTime: true,
  checkInTime: true,
  chargingStartedAt: true,
  updatedAt: true,
  ratePerKwh: true,
  batteryBefore: true,
  user: { select: { id: true, name: true, email: true, phone: true } },
  ev: {
    select: {
      id: true,
      model: true,
      licensePlate: true,
      batteryCapacity: true,
      batteryPercentage: true,
    },
  },
  actualEv: {
    select: {
      id: true,
      model: true,
      licensePlate: true,
      batteryCapacity: true,
      batteryPercentage: true,
    },
  },
  slot: {
    select: {
      id: true,
      slotNumber: true,
      powerKw: true,
      status: true,
      updatedAt: true,
      station: { select: { id: true, ownerId: true, pricePerKwh: true } },
    },
  },
};

const presentSession = (booking, now) => {
  const metrics = liveMetrics(booking, now);
  return {
    bookingId: booking.id,
    customer: booking.user,
    vehicle: booking.actualEv || booking.ev,
    slot: {
      id: booking.slot.id,
      slotNumber: booking.slot.slotNumber,
      powerKw: booking.slot.powerKw,
      status: booking.slot.status,
    },
    startTime: metrics.startedAt,
    durationMinutes: metrics.durationMinutes,
    energyKwh: metrics.energyKwh,
    ratePerKwh: metrics.ratePerKwh,
    currentBill: metrics.currentBill,
    chargerStatus: booking.slot.status,
    lastUpdate: booking.updatedAt > booking.slot.updatedAt ? booking.updatedAt : booking.slot.updatedAt,
    sessionStatus: booking.status,
  };
};

export const getOwnerLiveSessions = async (req, res, next) => {
  try {
    const station = await prisma.chargingStation.findUnique({
      where: { ownerId: req.user.id },
      select: { id: true },
    });
    if (!station) return res.status(404).json({ success: false, message: 'Station not found' });

    const [activeBookings, occupiedSlots] = await Promise.all([
      prisma.booking.findMany({
        where: { status: 'ACTIVE', slot: { stationId: station.id } },
        select: sessionSelect,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.slot.findMany({
        where: { stationId: station.id, status: 'OCCUPIED' },
        select: { id: true, slotNumber: true, powerKw: true, status: true, updatedAt: true },
        orderBy: { slotNumber: 'asc' },
      }),
    ]);

    const now = new Date();
    const sessions = activeBookings.map((booking) => presentSession(booking, now));
    const activeSlotIds = new Set(activeBookings.map((booking) => booking.slot.id));

    // An owner may manually mark a charger occupied before a booking becomes
    // ACTIVE. Keep it visible, but never invent customer/session telemetry.
    occupiedSlots.forEach((slot) => {
      if (!activeSlotIds.has(slot.id)) {
        sessions.push({
          bookingId: null,
          customer: null,
          vehicle: null,
          slot,
          startTime: null,
          durationMinutes: null,
          energyKwh: null,
          ratePerKwh: null,
          currentBill: null,
          chargerStatus: slot.status,
          lastUpdate: slot.updatedAt,
          sessionStatus: 'NO_ACTIVE_BOOKING',
        });
      }
    });

    res.json({ success: true, data: sessions, serverTime: now.toISOString() });
  } catch (error) {
    next(error);
  }
};

export const emergencyStopSession = async (req, res, next) => {
  try {
    const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
    if (reason.length < 3 || reason.length > 500) {
      return res.status(400).json({
        success: false,
        message: 'A stop reason between 3 and 500 characters is required',
      });
    }

    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      select: {
        ...sessionSelect,
        totalCost: true,
        payment: true,
        slot: {
          select: {
            ...sessionSelect.slot.select,
            station: { select: { id: true, ownerId: true, pricePerKwh: true, name: true } },
          },
        },
      },
    });
    if (!booking) return res.status(404).json({ success: false, message: 'Session not found' });
    if (booking.slot.station.ownerId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'This session belongs to another station' });
    }
    if (booking.status !== 'ACTIVE') {
      return res.status(409).json({ success: false, message: 'This charging session is no longer active' });
    }

    const endTime = new Date();
    const metrics = liveMetrics(booking, endTime);
    const chargingEv = booking.actualEv || booking.ev;
    const batteryAfter = estimateBatteryAfter(booking.batteryBefore, metrics.energyKwh, chargingEv?.batteryCapacity);
    const claimed = await prisma.booking.updateMany({
      where: { id: booking.id, status: 'ACTIVE' },
      data: {
        status: 'COMPLETED',
        endTime,
        finalEnergyKwh: metrics.energyKwh,
        durationMinutes: metrics.durationMinutes,
        finalBill: metrics.currentBill,
        ratePerKwh: metrics.ratePerKwh,
        stopReason: reason,
        emergencyStoppedBy: req.user.id,
        emergencyStoppedAt: endTime,
        batteryAfter,
      },
    });
    if (claimed.count !== 1) {
      return res.status(409).json({ success: false, message: 'This charging session was already stopped' });
    }
    if (batteryAfter != null && chargingEv) {
      await prisma.eV.update({ where: { id: chargingEv.id }, data: { batteryPercentage: batteryAfter } });
    }

    // Physical fault states must win over session churn.
    await prisma.slot.updateMany({
      where: {
        id: booking.slot.id,
        status: { notIn: ['MAINTENANCE', 'OFFLINE', 'FAULTED'] },
      },
      data: { status: 'AVAILABLE' },
    });

    // The customer paid totalCost upfront, for the full reserved window — but
    // this session was cut short, so finalBill (actual usage) is less than
    // what they already paid. Refund exactly that unused difference — the
    // same leftover computation ownerCancelBooking uses when it cancels a
    // booking that's already mid-charge (see booking.controller.js).
    let refundAmount = null;
    if (booking.payment?.status === 'COMPLETED' && booking.totalCost != null) {
      const leftover = round(
        Math.min(Math.max(booking.totalCost - metrics.currentBill, 0), booking.payment.amount)
      );
      if (leftover > 0) {
        // Mock-mode payments carry a fake pi_mock_* id (still truthy) — only
        // a real STRIPE-method payment has an id Stripe's API will recognize.
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
          where: { id: booking.slot.station.id },
          data: { totalRevenue: { decrement: leftover } },
        });
        refundAmount = leftover;
      }
    }

    const payload = {
      bookingId: booking.id,
      slotId: booking.slot.id,
      status: 'COMPLETED',
      endTime,
      finalEnergyKwh: metrics.energyKwh,
      durationMinutes: metrics.durationMinutes,
      finalBill: metrics.currentBill,
      ratePerKwh: metrics.ratePerKwh,
      stopReason: reason,
      emergencyStoppedBy: req.user.id,
      emergencyStoppedAt: endTime,
      refundAmount,
    };
    const io = getIO();
    io?.to(`user:${booking.user.id}`).emit('booking:status-changed', payload);
    io?.to(`user:${req.user.id}`).emit('charging-session:stopped', payload);
    io?.to(`slot:${booking.slot.id}`).emit('slot:availability-changed', {
      slotId: booking.slot.id,
      status: 'AVAILABLE',
    });

    const { subject, html } = emailTemplates.chargingEmergencyStopped(booking.user.name, {
      stationName: booking.slot.station.name,
      slotNumber: booking.slot.slotNumber,
      reason,
      finalBill: metrics.currentBill,
      refundAmount,
    });
    sendEmail({ to: booking.user.email, subject, html });

    audit(
      req,
      'CHARGING_SESSION_EMERGENCY_STOPPED',
      `Stopped booking ${booking.id}: ${reason}${refundAmount ? ` (refunded ${refundAmount})` : ''}`
    );
    res.json({ success: true, message: 'Charging session stopped', data: payload });
  } catch (error) {
    next(error);
  }
};
