import express from 'express';
import rateLimit from 'express-rate-limit';
import { sendOTP, verifyOTP, resendOTP, getStatus } from '../controllers/verification.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(authenticate);

// These three had NO rate limiting at all despite the app-wide limiter
// pattern used everywhere else (app.js) — the service layer's own
// attempt/cooldown tracking is the primary defense, these are a backstop
// against sheer request volume (e.g. a script hammering verify-otp faster
// than the per-account lockout alone would catch).
const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many verification attempts. Please wait 15 minutes.' }
});
const otpSendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many code requests. Please wait 15 minutes.' }
});

router.post('/send-otp', otpSendLimiter, sendOTP);
router.post('/verify-otp', otpVerifyLimiter, verifyOTP);
router.post('/resend-otp', otpSendLimiter, resendOTP);
router.get('/verification-status', getStatus);

export default router;
