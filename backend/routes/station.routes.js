import express from 'express';
import { getOwnerLiveSessions } from '../controllers/chargingSession.controller.js';
import {
  createStation,
  getMyStation,
  updateStation,
  getAllStations,
  getStationById,
  getStationBookings,
  getStationBookingDetails,
  getStationReport,
  getStationRevenue,
} from '../controllers/station.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { requireVerified } from '../middleware/kyc.middleware.js';

const router = express.Router();

// ⚠️  IMPORTANT: specific static paths MUST come before the /:id wildcard.
// Express matches in registration order — if /:id is first, every request to
// /owner/mine is caught with req.params.id = "owner", causing a Prisma
// malformed-ObjectId error and a 500 on every owner dashboard load.

// Station-owner routes (static paths — registered first)
router.get('/owner/mine', authenticate, authorize('STATION_OWNER'), getMyStation);
router.put('/owner/mine', authenticate, authorize('STATION_OWNER'), updateStation);
router.get('/owner/bookings', authenticate, authorize('STATION_OWNER'), getStationBookings);
router.get(
  '/owner/bookings/:bookingId',
  authenticate,
  authorize('STATION_OWNER'),
  getStationBookingDetails
);
router.get('/owner/revenue', authenticate, authorize('STATION_OWNER'), getStationRevenue);
router.get('/owner/reports', authenticate, authorize('STATION_OWNER'), getStationReport);
router.get('/owner/live-sessions', authenticate, authorize('STATION_OWNER'), getOwnerLiveSessions);

// Public routes
router.get('/', getAllStations);
router.post('/', authenticate, authorize('STATION_OWNER'), requireVerified(), createStation);

// Wildcard param route — LAST
router.get('/:id', getStationById);

export default router;
