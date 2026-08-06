import express from 'express';
import { getOwnerAuctions, getAuctionBids } from '../controllers/auction.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/owner', authenticate, authorize('STATION_OWNER'), getOwnerAuctions);
router.get('/:id/bids', authenticate, authorize('STATION_OWNER'), getAuctionBids);

export default router;
