import express from 'express';
import {
  getDashboardStats,
  getAllUsers,
  blockUser,
  deleteUser,
  promoteToAdmin,
  getAllStations,
  approveStation,
  getStationUpdateRequests,
  reviewStationUpdateRequest,
  getAllBookings,
  getAuditLogs,
} from '../controllers/admin.controller.js';
import { getAdminAnalytics } from '../controllers/analytics.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { validateQuery } from '../middleware/validateQuery.middleware.js';

const PERIOD_VALUES = ['weekly', 'monthly', 'yearly'];

const router = express.Router();

router.use(authenticate);
router.use(authorize('ADMIN'));

router.get('/dashboard', getDashboardStats);
router.get(
  '/analytics',
  validateQuery({
    growthPeriod: PERIOD_VALUES,
    moneyPeriod: PERIOD_VALUES,
    activityPeriod: PERIOD_VALUES,
    energyPeriod: PERIOD_VALUES,
  }),
  getAdminAnalytics
);
router.get(
  '/users',
  validateQuery({ role: ['EV_USER', 'STATION_OWNER', 'ADMIN'], search: null }),
  getAllUsers
);
router.patch('/users/:id/block', blockUser);
router.patch('/users/:id/promote', promoteToAdmin);
router.delete('/users/:id', deleteUser);
router.get(
  '/stations',
  validateQuery({ status: ['PENDING', 'APPROVED', 'REJECTED'] }),
  getAllStations
);
router.patch('/stations/:id/status', approveStation);
router.get(
  '/station-requests',
  validateQuery({ status: ['PENDING', 'APPROVED', 'REJECTED'] }),
  getStationUpdateRequests
);
router.patch('/station-requests/:id', reviewStationUpdateRequest);
router.get('/bookings', getAllBookings);
router.get('/logs', getAuditLogs);

export default router;
