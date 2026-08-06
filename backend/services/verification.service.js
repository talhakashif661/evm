import crypto from 'crypto';
import prisma from '../utils/prisma.js';
import { sendEmail } from '../utils/email.js';
import logger from '../utils/logger.js';
import { html } from '../utils/escapeHtml.js';

const OTP_EXPIRY_MINUTES = parseInt(process.env.OTP_EXPIRY_MINUTES || '10');
const MAX_VERIFICATION_ATTEMPTS = parseInt(process.env.MAX_VERIFICATION_ATTEMPTS || '3');
const VERIFICATION_BLOCK_HOURS = parseInt(process.env.VERIFICATION_BLOCK_HOURS || '1');
const RESEND_COOLDOWN_SECONDS = parseInt(process.env.RESEND_COOLDOWN_SECONDS || '60');

/** Generate a cryptographically random 6-digit OTP. */
export const generateOTP = () => crypto.randomInt(100000, 1000000).toString();

const hashOTP = (otp) => crypto.createHash('sha256').update(otp).digest('hex');

const otpEmailTemplate = (name, otp) => ({
  subject: 'Verify your ChargeEV account',
  html: html`
    <div
      style="font-family:Arial,sans-serif;background:#FDF8F0;color:#4A4A4A;padding:40px;border-radius:12px;max-width:480px;margin:0 auto"
    >
      <h1 style="color:#1A1A1A;font-size:20px">Hi ${name},</h1>
      <p>
        Use the code below to verify your email address. This code expires in ${OTP_EXPIRY_MINUTES}
        minutes.
      </p>
      <div
        style="background:#ffffff;padding:24px;border-radius:8px;margin:24px 0;text-align:center"
      >
        <span style="font-size:32px;letter-spacing:8px;font-weight:bold;color:#1A1A1A">${otp}</span>
      </div>
      <p style="color:#8A8A8A;font-size:13px">
        If you didn't request this, you can safely ignore this email.
      </p>
      <p style="color:#8A8A8A;margin-top:20px">The ChargeEV Team</p>
    </div>
  `,
});

/**
 * Generate, hash, store, and email a fresh OTP for the given user. Enforces
 * RESEND_COOLDOWN_SECONDS here, in the shared function, rather than in
 * resendOTP alone — POST /send-otp calls this directly too, so a cooldown
 * that only lived in the resend wrapper would be trivially bypassed by
 * hitting /send-otp instead.
 * @param {string} userId
 */
export const sendVerificationOTP = async (userId) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');
  if (user.isVerified) return { alreadyVerified: true };

  if (user.lastOtpSentAt) {
    const cooldownEnds = new Date(user.lastOtpSentAt.getTime() + RESEND_COOLDOWN_SECONDS * 1000);
    if (cooldownEnds > new Date()) {
      const secondsLeft = Math.ceil((cooldownEnds.getTime() - Date.now()) / 1000);
      return { alreadyVerified: false, cooldown: true, secondsLeft };
    }
  }

  const otp = generateOTP();
  const otpHash = hashOTP(otp);
  const expiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await prisma.user.update({
    where: { id: userId },
    data: {
      verificationOtpHash: otpHash,
      verificationOtpExpiry: expiry,
      lastOtpSentAt: new Date(),
    },
  });

  const { subject, html } = otpEmailTemplate(user.name, otp);
  const result = await sendEmail({ to: user.email, subject, html });

  if (!result.success) {
    // Do not leave an undelivered code looking like a successfully sent one.
    // Clearing the timestamp also lets the user retry immediately after the
    // mail configuration/provider issue has been corrected.
    await prisma.user.update({
      where: { id: userId },
      data: {
        verificationOtpHash: null,
        verificationOtpExpiry: null,
        lastOtpSentAt: null,
      },
    });
    logger.error(`Failed to deliver OTP email to ${user.email}: ${result.error}`);
    return { alreadyVerified: false, cooldown: false, emailSent: false };
  } else {
    logger.info(`Verification OTP sent to ${user.email}`);
  }

  return { alreadyVerified: false, cooldown: false, emailSent: true };
};

/**
 * Resend an OTP — a thin alias; the actual cooldown enforcement lives in
 * sendVerificationOTP so both routes share exactly one rate limit, not two
 * independent (and bypassable) ones.
 */
export const resendOTP = async (userId) => sendVerificationOTP(userId);

/**
 * Validate a submitted OTP against the stored hash, enforcing expiry AND a
 * lockout after MAX_VERIFICATION_ATTEMPTS wrong guesses in a row (without
 * this, the 6-digit code space — ~900k values — is brute-forceable well
 * within its OTP_EXPIRY_MINUTES window).
 */
export const verifyOTP = async (userId, submittedOtp) => {
  let user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');

  if (user.isVerified) {
    return { status: 'ALREADY_VERIFIED' };
  }

  const now = new Date();

  if (user.verificationBlockedUntil) {
    if (new Date(user.verificationBlockedUntil) > now) {
      return { status: 'BLOCKED', blockedUntil: user.verificationBlockedUntil };
    }
    // The block has since expired — clear it and start the attempt counter
    // fresh, rather than leaving the user one wrong guess away from an
    // instant re-block for the rest of time.
    user = await prisma.user.update({
      where: { id: userId },
      data: { verificationAttempts: 0, verificationBlockedUntil: null },
    });
  }

  if (!user.verificationOtpHash || !user.verificationOtpExpiry) {
    return { status: 'NO_OTP_PENDING' };
  }

  if (new Date(user.verificationOtpExpiry) < now) {
    return { status: 'EXPIRED' };
  }

  const submittedHash = hashOTP(String(submittedOtp));
  const isValid = submittedHash === user.verificationOtpHash;

  if (!isValid) {
    const attempts = user.verificationAttempts + 1;
    const blocked = attempts >= MAX_VERIFICATION_ATTEMPTS;
    const blockedUntil = blocked
      ? new Date(now.getTime() + VERIFICATION_BLOCK_HOURS * 60 * 60 * 1000)
      : null;
    await prisma.user.update({
      where: { id: userId },
      data: {
        // Reset to 0 the moment a block kicks in, so the counter starts
        // clean again once VERIFICATION_BLOCK_HOURS has passed.
        verificationAttempts: blocked ? 0 : attempts,
        lastVerificationAttempt: now,
        verificationBlockedUntil: blockedUntil,
      },
    });
    return blocked ? { status: 'BLOCKED', blockedUntil } : { status: 'INVALID' };
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      isVerified: true,
      verifiedAt: now,
      verificationOtpHash: null,
      verificationOtpExpiry: null,
      verificationAttempts: 0,
      verificationBlockedUntil: null,
    },
  });

  logger.info(`User ${user.email} verified successfully`);
  return { status: 'VERIFIED' };
};

export const getVerificationStatus = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isVerified: true, verifiedAt: true },
  });
  if (!user) throw new Error('User not found');

  return {
    isVerified: user.isVerified,
    verifiedAt: user.verifiedAt,
  };
};
