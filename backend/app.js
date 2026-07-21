import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import compression from 'compression';
import { getAllowedOrigins } from './utils/corsOrigins.js';
import prisma from './utils/prisma.js';

import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import evRoutes from './routes/ev.routes.js';
import stationRoutes from './routes/station.routes.js';
import slotRoutes from './routes/slot.routes.js';
import bookingRoutes from './routes/booking.routes.js';
import bidRoutes from './routes/bid.routes.js';
import adminRoutes from './routes/admin.routes.js';
import aiRoutes from './routes/ai.routes.js';
import paymentRoutes, { stripeWebhook } from './routes/payment.routes.js';
import complaintRoutes from './routes/complaint.routes.js';
import reviewRoutes from './routes/review.routes.js';
import verificationRoutes from './routes/verification.routes.js';
import { errorHandler } from './middleware/error.middleware.js';

dotenv.config();

const app = express();
const isProd = process.env.NODE_ENV === 'production';

// Render (and most PaaS hosts) put the app behind a reverse proxy. Without
// this, req.ip resolves to the proxy's internal IP for every request (so
// rate limiting effectively buckets ALL users together), and express-rate-limit
// v7 will throw a validation error on the X-Forwarded-For header it sees.
// `1` = trust exactly one hop, which matches Render's setup.
if (isProd) app.set('trust proxy', 1);

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: isProd
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'", process.env.CLIENT_URL].filter(Boolean),
          },
        }
      : false, // disable strict CSP in dev so Vite HMR / inline scripts aren't blocked
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(compression());

// Strict limiter for login - brute-force protection
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many login attempts. Please wait 15 minutes and try again.',
  },
});

// Strict limiter for registration - prevent mass account creation
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many registration attempts. Please try again in an hour.',
  },
});

// Forgot-password - prevent email-bombing an inbox
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many password reset requests. Please wait 15 minutes.' },
});

// Admin bootstrap - this was the only sensitive auth route with no limiter,
// which mattered because its key comparison wasn't timing-safe either.
const setupAdminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many admin setup attempts. Please wait 15 minutes and try again.',
  },
});

// Complaints allow GUEST (unauthenticated) submission by design, which makes
// this the one write endpoint with no auth friction at all standing between
// it and an abuser — unlike everything else behind apiLimiter below, which
// at least requires a registered, logged-in account first. Submissions land
// straight in a human's inbox, so a tighter, dedicated ceiling here.
const complaintLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many submissions. Please wait a while before trying again.',
  },
});

// Baseline ceiling for every other /api route (booking/bid/payment-intent
// creation, station/slot mutations, etc.) — those previously had no rate
// limiting at all once a request carried a valid JWT, only the handful of
// pre-auth routes above did.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Please slow down and try again shortly.',
  },
});

// Middleware
app.use(
  cors({
    origin: getAllowedOrigins(),
    credentials: true,
  })
);

// Stripe webhook signature verification needs the raw request body, which is
// gone once express.json() below has parsed it — so this one route is
// mounted here, ahead of that global parser, with its own raw-body parsing.
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), stripeWebhook);

// 2mb comfortably covers the largest legitimate payload (5 station images x
// 80KB + base64 overhead, or a 50KB avatar) — 10mb left an unrestricted
// resource-exhaustion surface on every endpoint, most of which don't accept
// large fields at all.
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/api', apiLimiter);
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/register', registerLimiter);
app.use('/api/auth/forgot-password', forgotPasswordLimiter);
app.use('/api/auth/setup-admin', setupAdminLimiter);
app.use('/api/complaints', complaintLimiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Sitemap — the static public pages plus every currently-APPROVED station,
// so real content (not just the fixed marketing pages) is discoverable.
// Uses CLIENT_URL (already the source of truth for the deployed frontend
// origin elsewhere in this file, e.g. the CSP connectSrc above) rather than
// a hardcoded domain. NOTE: this endpoint lives on the API host — see
// DEPLOYMENT.md for the one-line frontend rewrite needed so it's reachable
// at yourfrontend.com/sitemap.xml (where search engines expect it), not just
// on the backend's own domain.
app.get('/sitemap.xml', async (req, res, next) => {
  try {
    const base = (process.env.CLIENT_URL || '').replace(/\/$/, '');
    const staticUrls = [
      { loc: '/', changefreq: 'weekly', priority: '1.0' },
      { loc: '/stations', changefreq: 'daily', priority: '0.9' },
      { loc: '/about', changefreq: 'monthly', priority: '0.5' },
      { loc: '/contact', changefreq: 'monthly', priority: '0.5' },
    ];

    const stations = await prisma.chargingStation.findMany({
      where: { status: 'APPROVED' },
      select: { id: true, updatedAt: true },
    });
    const stationUrls = stations.map((s) => ({
      loc: `/stations/${s.id}`,
      lastmod: s.updatedAt.toISOString().slice(0, 10),
      changefreq: 'weekly',
      priority: '0.8',
    }));

    const urls = [...staticUrls, ...stationUrls];
    const body = urls
      .map((u) =>
        [
          '  <url>',
          `    <loc>${base}${u.loc}</loc>`,
          u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>` : null,
          `    <changefreq>${u.changefreq}</changefreq>`,
          `    <priority>${u.priority}</priority>`,
          '  </url>',
        ]
          .filter(Boolean)
          .join('\n')
      )
      .join('\n');

    res
      .type('application/xml')
      .send(
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`
      );
  } catch (error) {
    next(error);
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/auth', verificationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/evs', evRoutes);
app.use('/api/stations', stationRoutes);
app.use('/api/slots', slotRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/bids', bidRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/reviews', reviewRoutes);

// Error handler
app.use(errorHandler);

export default app;
