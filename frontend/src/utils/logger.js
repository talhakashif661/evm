// Lightweight client-side logger.
//
// Rationale: raw `console.*` calls scattered through components are noisy in
// production and easy to leave behind by accident. This wrapper keeps a single
// place to control that behaviour. In development (Vite sets import.meta.env.DEV)
// messages print to the console as usual; in a production build they are
// suppressed so the browser console stays clean for end users.
//
// Remote error tracking (Sentry) is wired into the `error` method below, as
// this comment used to say it should be — every call site already routes
// through here, so this one change gives every existing logger.error(...)
// call in the app remote visibility for free. No-ops entirely unless
// VITE_SENTRY_DSN is set, and even then only in a production build, so local
// dev never sends events anywhere.
import * as Sentry from '@sentry/react';

const isDev = import.meta.env.DEV;
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
const sentryEnabled = import.meta.env.PROD && Boolean(sentryDsn);

export function initErrorTracking() {
  if (sentryEnabled) {
    Sentry.init({ dsn: sentryDsn });
  }
}

export const logger = {
  error: (...args) => {
    if (isDev) console.error('[Unified EV]', ...args);
    if (sentryEnabled) {
      const err = args.find((a) => a instanceof Error);
      if (err) Sentry.captureException(err);
      else Sentry.captureMessage(args.map(String).join(' '));
    }
  },
  warn: (...args) => {
    if (isDev) console.warn('[Unified EV]', ...args);
  },
  info: (...args) => {
    if (isDev) console.info('[Unified EV]', ...args);
  },
};

export default logger;
