import express from 'express';
import {
  addSlot,
  getStationSlots,
  updateSlotStatus,
  openAuction,
  closeAuction,
  deleteSlot,
  getSlotAvailability,
} from '../controllers/slot.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/station/:stationId', getStationSlots);
router.get('/:id/availability', getSlotAvailability);
router.post('/', authenticate, authorize('STATION_OWNER'), addSlot);
router.put('/:id/status', authenticate, authorize('STATION_OWNER'), updateSlotStatus);
router.post('/:id/auction/open', authenticate, authorize('STATION_OWNER'), openAuction);
router.post('/:id/auction/close', authenticate, authorize('STATION_OWNER'), closeAuction);
router.delete('/:id', authenticate, authorize('STATION_OWNER'), deleteSlot);

export default router;
