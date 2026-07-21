import express from 'express';
import { getRecommendations } from '../controllers/ai.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/recommend', authenticate, getRecommendations);

export default router;
