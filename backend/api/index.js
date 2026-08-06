// Vercel invokes this Express app as a serverless function. Do not import
// server.js here: it starts a persistent HTTP server, Socket.IO, and timers,
// none of which are supported by Vercel Functions.
import app from '../app.js';

export default app;
