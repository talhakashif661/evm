import express from 'express';
import {
  register,
  login,
  logout,
  getMe,
  changePassword,
  setupAdmin,
  forgotPassword,
  resetPassword,
} from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.js';
import {
  registerRules,
  loginRules,
  forgotPasswordRules,
  resetPasswordRules,
} from '../validators/authValidators.js';

const router = express.Router();

router.post('/register', registerRules, validate, register);
router.post('/setup-admin', setupAdmin);
router.post('/login', loginRules, validate, login);
router.post('/forgot-password', forgotPasswordRules, validate, forgotPassword);
router.post('/reset-password', resetPasswordRules, validate, resetPassword);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getMe);
router.put('/change-password', authenticate, changePassword);

export default router;
