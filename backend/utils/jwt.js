import jwt from 'jsonwebtoken';

export const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    algorithm: 'HS256'
  });
};

export const verifyToken = (token) => {
  // Pinning algorithms defends against algorithm-confusion attacks even
  // though jsonwebtoken already infers an HMAC-only set from a plain string
  // secret — explicit is cheap insurance against a future library change.
  return jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
};
