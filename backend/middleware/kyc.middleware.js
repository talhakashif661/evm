/**
 * requireVerified
 *
 * Blocks unverified users from sensitive actions (placing bids, creating
 * bookings/stations). Admins are exempt. Must run after `authenticate`.
 */
export const requireVerified = () => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (req.user.role === 'ADMIN') return next();

    if (!req.user.isVerified) {
      return res.status(403).json({
        success: false,
        message: 'Email verification required. Please verify your email first.',
        error: 'EMAIL_NOT_VERIFIED',
      });
    }

    next();
  };
};
