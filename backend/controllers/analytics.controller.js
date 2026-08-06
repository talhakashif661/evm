import prisma from '../utils/prisma.js';
import { parsePagination, paginationMeta } from '../utils/pagination.js';
import { buildBuckets, normalizePeriod } from '../utils/analyticsPeriods.js';

const round = (value) => Number((value || 0).toFixed(2));

// Actual money kept by the platform for a completed session. Emergency-stopped
// sessions were partially refunded down to finalBill (see
// chargingSession.controller.js), so use that instead of the full upfront
// totalCost; ordinary completions never set finalBill, so fall back to
// totalCost plus any overage billed separately (see completeBooking).
const sessionCost = (booking) =>
  (booking.finalBill ?? booking.totalCost ?? 0) + (booking.overageAmount ?? 0);

const MONTHS_BACK = 6;
const BATTERY_PATTERN_LIMIT = 10;

/**
 * GET /api/users/usage-analytics
 * Everything here is scoped to the logged-in user's COMPLETED bookings only —
 * cancelled/pending bookings never have energy/cost/battery data, so mixing
 * them in would just be nulls diluting the averages.
 */
export const getUsageAnalytics = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const userId = req.user.id;
    const where = { userId, status: 'COMPLETED' };

    const [allCompleted, historyRows, historyTotal] = await Promise.all([
      // Small, aggregate-only projection of every completed session — used
      // for the summary cards and the two charts, never sent to the client.
      prisma.booking.findMany({
        where,
        select: {
          finalEnergyKwh: true,
          totalCost: true,
          finalBill: true,
          overageAmount: true,
          batteryBefore: true,
          batteryAfter: true,
          endTime: true,
          createdAt: true,
        },
        orderBy: { endTime: 'desc' },
      }),
      // The one page of rows actually rendered in the Charging History table.
      prisma.booking.findMany({
        where,
        select: {
          id: true,
          endTime: true,
          createdAt: true,
          durationMinutes: true,
          finalEnergyKwh: true,
          batteryBefore: true,
          batteryAfter: true,
          totalCost: true,
          finalBill: true,
          overageAmount: true,
          status: true,
          slot: { select: { station: { select: { name: true } } } },
        },
        orderBy: { endTime: 'desc' },
        skip,
        take: limit,
      }),
      prisma.booking.count({ where }),
    ]);

    // ---- Summary cards ----
    const totalSessions = allCompleted.length;
    const totalEnergyUsed = round(allCompleted.reduce((sum, b) => sum + (b.finalEnergyKwh || 0), 0));
    const totalAmountSpent = round(allCompleted.reduce((sum, b) => sum + sessionCost(b), 0));

    const batteryDeltas = allCompleted
      .filter((b) => b.batteryBefore != null && b.batteryAfter != null)
      .map((b) => b.batteryAfter - b.batteryBefore);
    const averageBatteryCharged = batteryDeltas.length
      ? round(batteryDeltas.reduce((sum, d) => sum + d, 0) / batteryDeltas.length)
      : 0;

    // ---- Monthly Charging Cost: last 6 calendar months, oldest -> newest ----
    const last6Months = Array.from({ length: MONTHS_BACK }, (_, i) => {
      const d = new Date();
      d.setDate(1); // avoid end-of-month overflow (e.g. Jul 31 -> Jun 31)
      d.setMonth(d.getMonth() - i);
      return {
        key: `${d.getFullYear()}-${d.getMonth()}`,
        month: d.toLocaleString('en', { month: 'short' }),
        year: d.getFullYear(),
      };
    }).reverse();

    const costByMonthKey = {};
    allCompleted.forEach((b) => {
      const d = new Date(b.endTime || b.createdAt);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      costByMonthKey[key] = (costByMonthKey[key] || 0) + sessionCost(b);
    });

    const monthlyCostData = last6Months.map((m) => ({
      month: m.month,
      year: m.year,
      cost: round(costByMonthKey[m.key] || 0),
    }));

    // ---- Battery Charging Pattern: latest N sessions with both readings ----
    const batteryPatternData = allCompleted
      .filter((b) => b.batteryBefore != null && b.batteryAfter != null)
      .slice(0, BATTERY_PATTERN_LIMIT)
      .map((b) => ({
        date: b.endTime || b.createdAt,
        batteryBefore: round(b.batteryBefore),
        batteryAfter: round(b.batteryAfter),
      }))
      .reverse(); // chronological (oldest -> newest) for a left-to-right chart

    // ---- Charging History table (paginated) ----
    const paginatedChargingHistory = historyRows.map((b) => ({
      id: b.id,
      date: b.endTime || b.createdAt,
      stationName: b.slot?.station?.name || 'Unknown Station',
      durationMinutes: b.durationMinutes,
      energyUsed: b.finalEnergyKwh,
      batteryBefore: b.batteryBefore,
      batteryAfter: b.batteryAfter,
      finalCost: round(sessionCost(b)),
      status: b.status,
    }));

    res.json({
      success: true,
      data: {
        totalSessions,
        totalEnergyUsed,
        totalAmountSpent,
        averageBatteryCharged,
        monthlyCostData,
        batteryPatternData,
        paginatedChargingHistory,
      },
      pagination: paginationMeta(historyTotal, page, limit),
    });
  } catch (error) {
    next(error);
  }
};

// A payment "processed" money at some point even if part or all of it was
// later refunded — excluding refunded rows would silently shrink a past
// bucket's total the moment a later refund happens, which makes for a very
// confusing trend line. PENDING/FAILED payments never actually moved money.
const PROCESSED_PAYMENT_STATUSES = ['COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED'];

const inRange = (date, start, end) => {
  const d = new Date(date);
  return d >= start && d <= end;
};

/**
 * GET /api/admin/analytics
 * Platform-wide analytics for the admin Analytics section: 8 all-time
 * summary figures plus 4 independently-filterable (weekly/monthly/yearly)
 * line-chart series. One endpoint for the whole page — each chart's period
 * is just a separate query param, all re-fetched together on any filter
 * change (the data volume here is trivial at this app's scale).
 */
export const getAdminAnalytics = async (req, res, next) => {
  try {
    const growthPeriod = normalizePeriod(req.query.growthPeriod);
    const moneyPeriod = normalizePeriod(req.query.moneyPeriod);
    const activityPeriod = normalizePeriod(req.query.activityPeriod);
    const energyPeriod = normalizePeriod(req.query.energyPeriod);

    const [people, payments, completedBookings] = await Promise.all([
      prisma.user.findMany({
        where: { role: { in: ['EV_USER', 'STATION_OWNER'] } },
        select: { role: true, createdAt: true },
      }),
      prisma.payment.findMany({
        where: { status: { in: PROCESSED_PAYMENT_STATUSES } },
        select: { amount: true, createdAt: true },
      }),
      prisma.booking.findMany({
        where: { status: 'COMPLETED' },
        select: {
          finalEnergyKwh: true,
          totalCost: true,
          finalBill: true,
          overageAmount: true,
          durationMinutes: true,
          batteryBefore: true,
          batteryAfter: true,
          endTime: true,
          createdAt: true,
        },
      }),
    ]);

    const evUsers = people.filter((u) => u.role === 'EV_USER');
    const stationOwners = people.filter((u) => u.role === 'STATION_OWNER');

    // ---- Summary cards (all-time, independent of the chart period filters) ----
    const totalUsers = evUsers.length;
    const totalStationOwners = stationOwners.length;
    const totalMoneyProcessed = round(payments.reduce((sum, p) => sum + p.amount, 0));
    const totalChargingSessions = completedBookings.length;
    const totalEnergyCharged = round(
      completedBookings.reduce((sum, b) => sum + (b.finalEnergyKwh || 0), 0)
    );
    const totalSpent = completedBookings.reduce((sum, b) => sum + sessionCost(b), 0);
    const averageChargingCost = totalChargingSessions
      ? round(totalSpent / totalChargingSessions)
      : 0;

    const durationsAvailable = completedBookings.filter((b) => b.durationMinutes != null);
    const averageChargingDuration = durationsAvailable.length
      ? round(
          durationsAvailable.reduce((sum, b) => sum + b.durationMinutes, 0) /
            durationsAvailable.length
        )
      : 0;

    const batteryDeltas = completedBookings
      .filter((b) => b.batteryBefore != null && b.batteryAfter != null)
      .map((b) => b.batteryAfter - b.batteryBefore);
    const averageBatteryCharged = batteryDeltas.length
      ? round(batteryDeltas.reduce((sum, d) => sum + d, 0) / batteryDeltas.length)
      : 0;

    // ---- 1. User & Station Owner Growth (cumulative headcount as of each bucket's end) ----
    const growth = buildBuckets(growthPeriod).map((bucket) => ({
      label: bucket.label,
      users: evUsers.filter((u) => new Date(u.createdAt) <= bucket.end).length,
      stationOwners: stationOwners.filter((u) => new Date(u.createdAt) <= bucket.end).length,
    }));

    // ---- 2. Money Processed (sum per bucket) ----
    const moneyProcessed = buildBuckets(moneyPeriod).map((bucket) => ({
      label: bucket.label,
      amount: round(
        payments
          .filter((p) => inRange(p.createdAt, bucket.start, bucket.end))
          .reduce((sum, p) => sum + p.amount, 0)
      ),
    }));

    // ---- 3. Charging Activity: completed sessions per bucket ----
    const chargingActivity = buildBuckets(activityPeriod).map((bucket) => ({
      label: bucket.label,
      sessions: completedBookings.filter((b) =>
        inRange(b.endTime || b.createdAt, bucket.start, bucket.end)
      ).length,
    }));

    // ---- 4. Energy Charged: kWh per bucket ----
    const energyCharged = buildBuckets(energyPeriod).map((bucket) => ({
      label: bucket.label,
      energy: round(
        completedBookings
          .filter((b) => inRange(b.endTime || b.createdAt, bucket.start, bucket.end))
          .reduce((sum, b) => sum + (b.finalEnergyKwh || 0), 0)
      ),
    }));

    res.json({
      success: true,
      data: {
        summary: {
          totalUsers,
          totalStationOwners,
          totalMoneyProcessed,
          totalChargingSessions,
          totalEnergyCharged,
          averageChargingCost,
          averageChargingDuration,
          averageBatteryCharged,
        },
        growth: { period: growthPeriod, data: growth },
        moneyProcessed: { period: moneyPeriod, data: moneyProcessed },
        chargingActivity: { period: activityPeriod, data: chargingActivity },
        energyCharged: { period: energyPeriod, data: energyCharged },
      },
    });
  } catch (error) {
    next(error);
  }
};
