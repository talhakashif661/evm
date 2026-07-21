import prisma from '../utils/prisma.js';
import { sendEmail, emailTemplates } from '../utils/email.js';
import { audit } from '../utils/audit.js';
import { expireAllStaleBookings } from '../utils/bookingExpiry.js';
import { getIO } from '../utils/socket.js';
import { escapeRegex } from '../utils/regex.js';
import { clearCacheByPrefix } from '../utils/simpleCache.js';

export const getDashboardStats = async (req, res, next) => {
  try {
    const [
      totalUsers, totalStations, totalBookings, totalRevenue,
      activeBookings, pendingStations, totalBids
    ] = await Promise.all([
      prisma.user.count({ where: { role: 'EV_USER' } }),
      prisma.chargingStation.count({ where: { status: 'APPROVED' } }),
      prisma.booking.count(),
      prisma.chargingStation.aggregate({ _sum: { totalRevenue: true } }),
      // "Charging right now": live bookings whose reserved window covers the
      // current moment (the old version counted status ACTIVE, which nothing
      // ever set, so this stat was permanently 0).
      prisma.booking.count({
        where: {
          status: { in: ['CONFIRMED', 'ACTIVE'] },
          startTime: { lte: new Date() },
          OR: [{ plannedEndTime: null }, { plannedEndTime: { gt: new Date() } }]
        }
      }),
      prisma.chargingStation.count({ where: { status: 'PENDING' } }),
      prisma.bid.count()
    ]);

    // Recent activity
    const recentBookings = await prisma.booking.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { name: true, email: true } },
        slot: { include: { station: { select: { name: true } } } }
      }
    });

    // Monthly bookings for chart
    // BUG FIX: this used to build the last-6-months labels and return them
    // with no actual booking counts attached — the chart data was always
    // empty. Pull bookings created in that window and tally them per month.
    const rangeStart = new Date();
    rangeStart.setMonth(rangeStart.getMonth() - 5);
    rangeStart.setDate(1);
    rangeStart.setHours(0, 0, 0, 0);

    const last6Months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      return { month: d.toLocaleString('en', { month: 'short' }), year: d.getFullYear(), date: d };
    }).reverse();

    const bookingsInRange = await prisma.booking.findMany({
      where: { createdAt: { gte: rangeStart } },
      select: { createdAt: true }
    });

    const countsByKey = {};
    bookingsInRange.forEach(b => {
      const d = new Date(b.createdAt);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      countsByKey[key] = (countsByKey[key] || 0) + 1;
    });

    const chartData = last6Months.map(m => ({
      name: m.month,
      month: m.month,
      year: m.year,
      bookings: countsByKey[`${m.year}-${m.date.getMonth()}`] || 0
    }));

    res.json({
      success: true,
      data: {
        stats: {
          totalUsers,
          totalStations,
          totalBookings,
          totalRevenue: totalRevenue._sum.totalRevenue || 0,
          activeBookings,
          pendingStations,
          totalBids
        },
        recentBookings,
        chartData
      }
    });
  } catch (error) {
    next(error);
  }
};

export const getAllUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, role, search } = req.query;
    const take = Math.min(parseInt(limit) || 20, 100);
    const skip = (Math.max(parseInt(page) || 1, 1) - 1) * take;

    const where = {
      ...(role && { role }),
      ...(search && {
        OR: [
          { name: { contains: escapeRegex(search), mode: 'insensitive' } },
          { email: { contains: escapeRegex(search), mode: 'insensitive' } }
        ]
      })
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true, name: true, email: true, role: true,
          isBlocked: true, isVerified: true, phone: true, createdAt: true,
          _count: { select: { bookings: true, evs: true } }
        },
        skip,
        take,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.user.count({ where })
    ]);

    res.json({
      success: true,
      data: users,
      pagination: { page: parseInt(page) || 1, limit: take, total, pages: Math.ceil(total / take) }
    });
  } catch (error) {
    next(error);
  }
};

export const blockUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({ where: { id } });

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.role === 'ADMIN') return res.status(400).json({ success: false, message: 'Cannot block admin' });

    await prisma.user.update({ where: { id }, data: { isBlocked: !user.isBlocked } });

    audit(req, user.isBlocked ? 'USER_UNBLOCKED' : 'USER_BLOCKED', `${user.isBlocked ? 'Unblocked' : 'Blocked'} ${user.email}`);

    res.json({ success: true, message: `User ${user.isBlocked ? 'unblocked' : 'blocked'} successfully` });
  } catch (error) {
    next(error);
  }
};

const LIVE_BOOKING_STATUSES = ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'ACTIVE'];

export const deleteUser = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.role === 'ADMIN') return res.status(400).json({ success: false, message: 'Cannot delete admin' });

    // Mirrors the same active-booking guard deleteEV/deleteSlot already have.
    // Without it, deleting a user cascades away (schema onDelete: Cascade)
    // any of their own live bookings — or, for a STATION_OWNER, every OTHER
    // customer's live/paid booking at their station — with no refund and no
    // notification, unlike every other cancellation path in this app.
    const ownActiveBooking = await prisma.booking.findFirst({
      where: { userId: user.id, status: { in: LIVE_BOOKING_STATUSES } }
    });
    if (ownActiveBooking) {
      return res.status(409).json({ success: false, message: 'This user has an active booking. Cancel it first.' });
    }

    if (user.role === 'STATION_OWNER') {
      const stationActiveBooking = await prisma.booking.findFirst({
        where: { slot: { station: { ownerId: user.id } }, status: { in: LIVE_BOOKING_STATUSES } }
      });
      if (stationActiveBooking) {
        return res.status(409).json({
          success: false,
          message: "This owner's station has active customer bookings. Cancel or complete them first — deleting now would leave those customers unrefunded."
        });
      }
    }

    await prisma.user.delete({ where: { id: req.params.id } });

    audit(req, 'USER_DELETED', `Deleted ${user.email} (role ${user.role})`);

    res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    next(error);
  }
};

// Lets an existing admin promote any EV_USER/STATION_OWNER to ADMIN. This is
// the *only* path to a second (or third...) admin — POST /api/auth/setup-admin
// only ever works once, for the very first admin.
export const promoteToAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.role === 'ADMIN') return res.status(400).json({ success: false, message: 'User is already an admin' });

    const updated = await prisma.user.update({
      where: { id },
      data: { role: 'ADMIN' },
      select: { id: true, name: true, email: true, role: true }
    });

    audit(req, 'USER_PROMOTED_ADMIN', `Promoted ${updated.email} to ADMIN`);

    res.json({ success: true, message: `${updated.name} is now an admin`, data: updated });
  } catch (error) {
    next(error);
  }
};

export const getAllStations = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const take = Math.min(parseInt(limit) || 20, 100);
    const skip = (Math.max(parseInt(page) || 1, 1) - 1) * take;

    const where = status ? { status } : {};

    const [stations, total] = await Promise.all([
      prisma.chargingStation.findMany({
        where,
        include: {
          owner: { select: { name: true, email: true, phone: true } },
          _count: { select: { slots: true } }
        },
        skip,
        take,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.chargingStation.count({ where })
    ]);

    res.json({
      success: true,
      data: stations,
      pagination: { page: parseInt(page) || 1, limit: take, total, pages: Math.ceil(total / take) }
    });
  } catch (error) {
    next(error);
  }
};

export const approveStation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { action } = req.body; // 'APPROVED' or 'REJECTED'

    if (!['APPROVED', 'REJECTED'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Action must be APPROVED or REJECTED' });
    }

    const station = await prisma.chargingStation.update({
      where: { id },
      data: { status: action },
      include: { owner: true }
    });

    // Approval and rejection are now symmetric — rejection used to notify
    // the owner NOTHING (no email, no socket event); they'd only find out by
    // happening to revisit their dashboard.
    if (action === 'APPROVED') {
      const { subject, html } = emailTemplates.stationApproved(station.owner.name, station.name);
      sendEmail({ to: station.owner.email, subject, html });
    } else {
      const { subject, html } = emailTemplates.stationRejected(station.owner.name, station.name);
      sendEmail({ to: station.owner.email, subject, html });
    }
    getIO()?.to(`user:${station.ownerId}`).emit('station:status-changed', { stationId: station.id, status: action });
    clearCacheByPrefix('stations:list:'); // a newly-APPROVED station must show up immediately, not after the TTL

    audit(req, `STATION_${action}`, `${action === 'APPROVED' ? 'Approved' : 'Rejected'} station "${station.name}" (owner ${station.owner.email})`);

    res.json({ success: true, message: `Station ${action.toLowerCase()}`, data: station });
  } catch (error) {
    next(error);
  }
};

export const getAllBookings = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const take = Math.min(parseInt(limit) || 20, 100);
    const skip = (Math.max(parseInt(page) || 1, 1) - 1) * take;

    await expireAllStaleBookings();

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        include: {
          user: { select: { name: true, email: true } },
          ev: { select: { model: true } },
          slot: { include: { station: { select: { name: true, city: true } } } },
          payment: true
        },
        skip,
        take,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.booking.count()
    ]);

    res.json({
      success: true,
      data: bookings,
      pagination: { page: parseInt(page) || 1, limit: take, total, pages: Math.ceil(total / take) }
    });
  } catch (error) {
    next(error);
  }
};

// Paginated audit trail of admin/system actions (see utils/audit.js). The Log
// model has no Prisma relation to User, so actor names are batch-resolved in a
// second query instead of an include.
export const getAuditLogs = async (req, res, next) => {
  try {
    const { page = 1, limit = 25 } = req.query;
    const take = Math.min(parseInt(limit) || 25, 100);
    const skip = (Math.max(parseInt(page) || 1, 1) - 1) * take;

    const [logs, total] = await Promise.all([
      prisma.log.findMany({ orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.log.count()
    ]);

    const actorIds = [...new Set(logs.map(l => l.userId).filter(Boolean))];
    const actors = actorIds.length
      ? await prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true, email: true }
        })
      : [];
    const actorById = Object.fromEntries(actors.map(a => [a.id, a]));

    res.json({
      success: true,
      data: logs.map(l => ({ ...l, actor: l.userId ? actorById[l.userId] || null : null })),
      pagination: { page: parseInt(page) || 1, limit: take, total, pages: Math.ceil(total / take) }
    });
  } catch (error) {
    next(error);
  }
};
