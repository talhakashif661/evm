import http from 'http';
import dotenv from 'dotenv';
import app from './app.js';
import prisma from './utils/prisma.js';
import { initSocket } from './utils/socket.js';
import { getAllowedOrigins } from './utils/corsOrigins.js';
import { expireNoShowBookings, expirePaymentTimeouts } from './utils/bookingExpiry.js';
import { expireEndedAuctions } from './utils/auctionExpiry.js';
import logger from './utils/logger.js';

dotenv.config();

// Fail fast and loud on boot rather than crashing on the first request that
// happens to touch a missing var (e.g. JWT_SECRET undefined would otherwise
// only surface as an opaque 500 from inside jwt.sign() on the first login).
const REQUIRED_ENV_VARS = ['DATABASE_URL', 'JWT_SECRET'];
const missingEnvVars = REQUIRED_ENV_VARS.filter((name) => !process.env[name]);
if (missingEnvVars.length > 0) {
  logger.error(
    `Missing required environment variable(s): ${missingEnvVars.join(', ')}. See .env.example.`
  );
  process.exit(1);
}

const PORT = process.env.PORT || 5000;

// Socket.IO needs a raw http.Server (not the Express app) to attach to, so
// requests still flow through Express exactly as before — this just adds a
// WebSocket upgrade path alongside it for real-time auction/bid updates.
const httpServer = http.createServer(app);
initSocket(httpServer, getAllowedOrigins());

// The no-show and payment-timeout cancellations back a live countdown in the
// UI and must proactively fire + push a socket notification — unlike the
// rest of this codebase's lazy sweep-on-read pattern, waiting for someone to
// incidentally load a booking list isn't good enough here. This is the one
// deliberate deviation from that convention, kept off during tests (which
// import app.js directly and never start this timer anyway).
let sweepInterval = null;
if (process.env.NODE_ENV !== 'test') {
  sweepInterval = setInterval(() => {
    expireNoShowBookings().catch((err) =>
      logger.error('expireNoShowBookings failed:', err.message)
    );
    expirePaymentTimeouts().catch((err) =>
      logger.error('expirePaymentTimeouts failed:', err.message)
    );
    // Auctions used to only ever close when the owner manually clicked
    // "Close Auction" — one whose deadline passed unattended stayed stuck
    // open forever. This resolves it the same way the manual close does.
    expireEndedAuctions().catch((err) => logger.error('expireEndedAuctions failed:', err.message));
  }, 30 * 1000);
}

httpServer.listen(PORT, () => {
  logger.info(`EV Management Server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV}`);
});

// PaaS platforms (Render, Railway, etc.) send SIGTERM before force-killing a
// container on redeploy/scale-down. Without handling it, in-flight requests
// get cut mid-response and the Prisma connection pool isn't released
// cleanly. This lets currently-running requests finish first.
const shutdown = (signal) => {
  logger.info(`${signal} received: closing server gracefully`);
  if (sweepInterval) clearInterval(sweepInterval);
  httpServer.close(async () => {
    await prisma.$disconnect();
    logger.info('Server closed');
    process.exit(0);
  });
  // Don't hang forever waiting for stubborn open connections (e.g. an idle
  // keep-alive socket or a still-open WebSocket) to close on their own.
  setTimeout(() => {
    logger.error('Forced shutdown after 10s timeout');
    process.exit(1);
  }, 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
