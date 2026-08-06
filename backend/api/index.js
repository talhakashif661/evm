// Vercel invokes this Express app as a serverless function. Do not import
// server.js here: it starts a persistent HTTP server, Socket.IO, and timers,
// none of which are supported by Vercel Functions.
import app from '../app.js';

export default function handler(req, res) {
  // Vercel Services removes the service routePrefix (`/api`) before handing
  // the request to this service. The existing Express application deliberately
  // keeps `/api` in its route definitions for local development and standalone
  // hosting, so restore it at this one deployment boundary.
  if (req.url !== '/health' && req.url !== '/sitemap.xml' && !req.url.startsWith('/api/')) {
    req.url = `/api${req.url.startsWith('/') ? '' : '/'}${req.url}`;
  }
  return app(req, res);
}
