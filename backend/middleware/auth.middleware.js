import { verifyToken } from '../utils/jwt.js';
import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      // tokenValidAfter added to this SAME lookup (no extra DB round trip —
      // this query already ran on every request) to support real logout:
      // POST /api/auth/logout sets it to now(), and any token whose iat
      // predates it is rejected below even though its signature still verifies.
      select: {
        id: true,
        email: true,
        role: true,
        isBlocked: true,
        isVerified: true,
        tokenValidAfter: true,
      },
    });

    if (!user) return res.status(401).json({ success: false, message: 'User not found' });
    if (user.isBlocked) return res.status(403).json({ success: false, message: 'Account blocked' });
    if (user.tokenValidAfter && decoded.iat * 1000 < user.tokenValidAfter.getTime()) {
      return res
        .status(401)
        .json({ success: false, message: 'Session expired. Please log in again.' });
    }

    req.user = user;
    next();
  } catch (error) {
    // debug, not error: an expired/invalid token is a routine, expected
    // client-side condition (every session naturally expires eventually),
    // not a server-side problem — logger.error is unconditional (logs in
    // production too) and would just be noise for something not actionable.
    logger.debug(error);
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ success: false, message: 'Access denied: insufficient permissions' });
    }
    next();
  };
};
