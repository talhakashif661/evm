import * as verificationService from '../services/verification.service.js';
import logger from '../utils/logger.js';

export const sendOTP = async (req, res, next) => {
  try {
    const result = await verificationService.sendVerificationOTP(req.user.id);

    if (result.alreadyVerified) {
      return res.status(400).json({ success: false, message: 'Your email is already verified.' });
    }
    if (result.cooldown) {
      return res.status(429).json({
        success: false,
        message: `Please wait ${result.secondsLeft}s before requesting another code.`,
        error: 'RESEND_COOLDOWN',
        secondsLeft: result.secondsLeft,
      });
    }
    if (!result.emailSent) {
      return res.status(503).json({
        success: false,
        message:
          'We could not deliver the verification email. Please try again shortly or contact support.',
        error: 'EMAIL_DELIVERY_FAILED',
      });
    }

    res.json({
      success: true,
      message: 'Verification code sent successfully',
      data: {},
    });
  } catch (error) {
    logger.error('sendOTP error:', error.message);
    next(error);
  }
};

export const verifyOTP = async (req, res, next) => {
  try {
    const { otp } = req.body;
    if (!otp) {
      return res
        .status(400)
        .json({ success: false, message: 'OTP is required', error: 'OTP_REQUIRED' });
    }

    const result = await verificationService.verifyOTP(req.user.id, otp);

    switch (result.status) {
      case 'VERIFIED':
        return res.json({
          success: true,
          message: 'Email verified successfully',
          data: { isVerified: true },
        });
      case 'ALREADY_VERIFIED':
        return res.status(400).json({
          success: false,
          message: 'Your email is already verified.',
          error: 'ALREADY_VERIFIED',
        });
      case 'NO_OTP_PENDING':
        return res.status(400).json({
          success: false,
          message: 'No verification code found. Please request a new one.',
          error: 'NO_OTP_PENDING',
        });
      case 'EXPIRED':
        return res.status(400).json({
          success: false,
          message: 'Verification code expired. Please request a new one.',
          error: 'OTP_EXPIRED',
        });
      case 'INVALID':
        return res.status(400).json({
          success: false,
          message: 'Invalid verification code.',
          error: 'OTP_INVALID',
        });
      case 'BLOCKED':
        return res.status(429).json({
          success: false,
          message: 'Too many incorrect attempts. Please try again later.',
          error: 'VERIFICATION_BLOCKED',
          blockedUntil: result.blockedUntil,
        });
      default:
        return res.status(500).json({ success: false, message: 'Unexpected verification error' });
    }
  } catch (error) {
    logger.error('verifyOTP error:', error.message);
    next(error);
  }
};

export const resendOTP = async (req, res, next) => {
  try {
    const result = await verificationService.resendOTP(req.user.id);

    if (result.alreadyVerified) {
      return res.status(400).json({ success: false, message: 'Your email is already verified.' });
    }
    if (result.cooldown) {
      return res.status(429).json({
        success: false,
        message: `Please wait ${result.secondsLeft}s before requesting another code.`,
        error: 'RESEND_COOLDOWN',
        secondsLeft: result.secondsLeft,
      });
    }
    if (!result.emailSent) {
      return res.status(503).json({
        success: false,
        message:
          'We could not deliver the verification email. Please try again shortly or contact support.',
        error: 'EMAIL_DELIVERY_FAILED',
      });
    }

    res.json({ success: true, message: 'Verification code resent successfully', data: {} });
  } catch (error) {
    logger.error('resendOTP error:', error.message);
    next(error);
  }
};

export const getStatus = async (req, res, next) => {
  try {
    const status = await verificationService.getVerificationStatus(req.user.id);
    res.json({ success: true, message: 'Verification status fetched', data: status });
  } catch (error) {
    logger.error('getStatus error:', error.message);
    next(error);
  }
};
