import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import prisma from '../utils/prisma.js';
import { generateToken } from '../utils/jwt.js';
import { sendEmail, emailTemplates } from '../utils/email.js';
import { sendVerificationOTP } from '../services/verification.service.js';
import logger from '../utils/logger.js';
import { audit } from '../utils/audit.js';

// Constant-time string comparison for secrets (the setup key). Hashing both
// sides to a fixed-length digest first means crypto.timingSafeEqual never
// has to deal with a length mismatch (which would itself throw/leak), and
// the comparison itself no longer short-circuits on the first differing byte.
const timingSafeEqualStrings = (a, b) => {
  const hashA = crypto.createHash('sha256').update(String(a)).digest();
  const hashB = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(hashA, hashB);
};

export const register = async (req, res, next) => {
  try {
    const { name, email, password, role, phone } = req.body;

    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ success: false, message: 'Name, email and password are required' });
    }

    if (!['EV_USER', 'STATION_OWNER'].includes(role)) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid role. Must be EV_USER or STATION_OWNER' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: { name, email, password: hashedPassword, role, phone },
      select: { id: true, name: true, email: true, role: true, isVerified: true, createdAt: true },
    });

    const token = generateToken({ id: user.id, email: user.email, role: user.role });

    // Send welcome email (non-blocking, never throws - see utils/email.js)
    const { subject, html } = emailTemplates.welcome(name);
    sendEmail({ to: email, subject, html });

    // Kick off email verification (non-blocking). Failure to send the OTP
    // email shouldn't block account creation - the user can hit
    // /api/auth/send-otp again from the verification page.
    sendVerificationOTP(user.id).catch((err) =>
      logger.error(`Failed to send initial verification OTP for ${user.email}:`, err.message)
    );

    res.status(201).json({
      success: true,
      message: 'Account created successfully. Please check your email to verify your account.',
      data: { user, token },
    });
  } catch (error) {
    next(error);
  }
};

// One-time (well — guarded, not literally one-shot) admin bootstrap endpoint.
// Meant to be called from Postman/curl, NOT from the public frontend:
//   POST /api/auth/setup-admin
//   headers: { "x-setup-key": "<ADMIN_SETUP_KEY from .env>" }
//   body:    { "name": "...", "email": "...", "password": "..." }
//
// It refuses to run if an ADMIN already exists in MongoDB, so it can't be used
// to mint extra admins later — that must be done by an existing admin via the
// admin panel/API. The created user is a normal row in the `User` collection,
// so it persists permanently in MongoDB and survives logout/restarts just like
// any other account.
export const setupAdmin = async (req, res, next) => {
  try {
    const setupKey = req.headers['x-setup-key'] || req.body.setupKey;
    if (
      !process.env.ADMIN_SETUP_KEY ||
      !setupKey ||
      !timingSafeEqualStrings(setupKey, process.env.ADMIN_SETUP_KEY)
    ) {
      return res.status(403).json({ success: false, message: 'Invalid or missing setup key' });
    }

    const existingAdmin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (existingAdmin) {
      return res
        .status(409)
        .json({
          success: false,
          message:
            'An admin account already exists. Use the admin panel to manage users from here on.',
        });
    }

    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ success: false, message: 'Name, email and password are required' });
    }
    if (password.length < 6) {
      return res
        .status(400)
        .json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    // Race safety on MongoDB without transactions — same pattern already
    // used for double-booking in booking.controller.js's createBooking:
    // optimistically insert, then re-query everyone who now holds the role.
    // Two concurrent bootstrap requests can both pass the existingAdmin
    // check above before either commits; the lexicographically smallest id
    // (ObjectIds give a total order) wins, the loser deletes its own row
    // and 403s instead of leaving two admins behind.
    const admin = await prisma.user.create({
      data: { name, email, password: hashedPassword, role: 'ADMIN', phone, isVerified: true },
      select: { id: true, name: true, email: true, role: true, isVerified: true, createdAt: true },
    });

    const allAdmins = await prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { id: true },
    });
    if (allAdmins.length > 1) {
      const winnerId = allAdmins.map((a) => a.id).sort()[0];
      if (admin.id !== winnerId) {
        await prisma.user.delete({ where: { id: admin.id } });
        return res
          .status(409)
          .json({
            success: false,
            message:
              'An admin account already exists. Use the admin panel to manage users from here on.',
          });
      }
    }

    const token = generateToken({ id: admin.id, email: admin.email, role: admin.role });

    logger.info(`Admin account bootstrapped via /setup-admin: ${admin.email}`);
    // req.user doesn't exist here (this endpoint is pre-auth), so record the
    // new admin as the actor of their own bootstrap.
    audit(
      { user: { id: admin.id }, ip: req.ip },
      'ADMIN_BOOTSTRAPPED',
      `First admin created: ${admin.email}`
    );

    res.status(201).json({
      success: true,
      message: 'Admin account created and saved permanently in MongoDB.',
      data: { user: admin, token },
    });
  } catch (error) {
    next(error);
  }
};

// ── Forgot / Reset Password ─────────────────────────────────────────────
// Flow: user requests a reset link -> we email a one-time token (hashed in
// the DB, 30 min expiry) -> user submits the raw token + new password.
// We always respond with the same generic message on request, whether or
// not the email exists, so this can't be used to enumerate accounts.
export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const genericResponse = () =>
      res.json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.',
      });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return genericResponse();

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const resetTokenExpiry = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    await prisma.user.update({
      where: { id: user.id },
      data: { resetTokenHash: tokenHash, resetTokenExpiry },
    });

    const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${rawToken}&email=${encodeURIComponent(email)}`;
    const { subject, html } = emailTemplates.passwordReset(user.name, resetUrl);
    sendEmail({ to: email, subject, html });

    logger.info(`Password reset requested for ${email}`);
    return genericResponse();
  } catch (error) {
    next(error);
  }
};

export const resetPassword = async (req, res, next) => {
  try {
    const { email, token, newPassword } = req.body;
    if (!email || !token || !newPassword) {
      return res
        .status(400)
        .json({ success: false, message: 'Email, token and new password are required' });
    }
    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({ success: false, message: 'New password must be at least 6 characters' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.resetTokenHash || !user.resetTokenExpiry) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset link' });
    }
    if (user.resetTokenExpiry < new Date()) {
      return res
        .status(400)
        .json({ success: false, message: 'Reset link has expired. Please request a new one.' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    if (!timingSafeEqualStrings(tokenHash, user.resetTokenHash)) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset link' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword, resetTokenHash: null, resetTokenExpiry: null },
    });

    logger.info(`Password reset completed for ${email}`);
    res.json({
      success: true,
      message: 'Password reset successful. You can now log in with your new password.',
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    // Select only what we need. IMPORTANT: do NOT `findUnique` the whole row
    // and strip just the password — the User model also holds sensitive
    // internal fields (verificationOtpHash, resetTokenHash, and their
    // expiries). Returning those in the login response leaks them to the
    // client (and into localStorage), and the OTP hash in particular is an
    // unsalted SHA-256 of a 6-digit code, so it's brute-forceable offline.
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
        role: true,
        isBlocked: true,
        isVerified: true,
        phone: true,
        avatar: true,
        createdAt: true,
      },
    });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (user.isBlocked) {
      return res.status(403).json({ success: false, message: 'Account has been blocked' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = generateToken({ id: user.id, email: user.email, role: user.role });

    const { password: _, ...userWithoutPassword } = user;

    res.json({
      success: true,
      message: user.isVerified
        ? 'Login successful'
        : 'Login successful. Please verify your email to unlock all features.',
      data: { user: userWithoutPassword, token },
    });
  } catch (error) {
    next(error);
  }
};

// Logs the user out of every device/tab at once: any JWT issued before this
// moment is rejected by `authenticate` from here on, even though its
// signature and expiry are both still valid. There's no per-token
// granularity (no way to log out just the current tab) — a reasonable
// tradeoff at this app's scale, and simpler than tracking individual tokens.
export const logout = async (req, res, next) => {
  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data: { tokenValidAfter: new Date() },
    });
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
};

export const getMe = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        avatar: true,
        isBlocked: true,
        isVerified: true,
        createdAt: true,
        evs: true,
        station: { select: { id: true, name: true, status: true } },
      },
    });

    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ success: false, message: 'Current password and new password are required' });
    }
    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({ success: false, message: 'New password must be at least 6 characters' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, password: true },
    });
    const isMatch = await bcrypt.compare(currentPassword, user.password);

    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashed },
    });

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    next(error);
  }
};
