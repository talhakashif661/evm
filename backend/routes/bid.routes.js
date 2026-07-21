import express from 'express';
import { placeBid, getSlotBids, getMyBids, cancelBid, getAuctionResults } from '../controllers/bid.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireVerified } from '../middleware/kyc.middleware.js';
import { validate } from '../middleware/validate.js';
import { placeBidRules } from '../validators/bookingValidators.js';

const router = express.Router();

router.get('/slot/:slotId', getSlotBids);
router.use(authenticate);
router.post('/', requireVerified(), placeBidRules, validate, placeBid);
router.get('/mine', getMyBids);
router.get('/results', getAuctionResults);
router.patch('/:id/cancel', cancelBid);

export default router;
