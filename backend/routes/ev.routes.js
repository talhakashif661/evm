import express from 'express';
import {
  addEV,
  getMyEVs,
  updateEV,
  deleteEV,
  updateBatteryLevel,
} from '../controllers/ev.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(authenticate);
router.use(authorize('EV_USER'));

router.post('/', addEV);
router.get('/', getMyEVs);
router.put('/:id', updateEV);
router.delete('/:id', deleteEV);
router.patch('/:id/battery', updateBatteryLevel);

export default router;
