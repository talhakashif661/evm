import * as Sentry from '@sentry/node';

const isDev = process.env.NODE_ENV !== 'production';
const sentryEnabled = !isDev && Boolean(process.env.SENTRY_DSN);

// No-ops entirely unless SENTRY_DSN is set, and even then only when
// NODE_ENV=production, so local dev never sends events anywhere. Every
// existing logger.error(...) call site — including error.middleware.js's
// central handler, which already wraps every unhandled route error — gets
// remote visibility for free from this one change.
if (sentryEnabled) {
  Sentry.init({ dsn: process.env.SENTRY_DSN });
}

const ts = () => new Date().toISOString();

export const logger = {
  info: (...args) => console.log(`[INFO] ${ts()}`, ...args),
  warn: (...args) => console.warn(`[WARN] ${ts()}`, ...args),
  error: (...args) => {
    console.error(`[ERROR] ${ts()}`, ...args);
    if (sentryEnabled) {
      const err = args.find((a) => a instanceof Error);
      if (err) Sentry.captureException(err);
      else Sentry.captureMessage(args.map(String).join(' '));
    }
  },
  debug: (...args) => {
    if (isDev) console.debug(`[DEBUG] ${ts()}`, ...args);
  },
};

export default logger;
