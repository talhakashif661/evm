// Lightweight client-side logger.
//
// Rationale: raw `console.*` calls scattered through components are noisy in
// production and easy to leave behind by accident. This wrapper keeps a single
// place to control that behaviour. In development (Vite sets import.meta.env.DEV)
// messages print to the console as usual; in a production build they are
// suppressed so the browser console stays clean for end users.
//
// If remote error tracking is added later (e.g. Sentry), wire it into the
// `error` method below — every call site already routes through here.

const isDev = import.meta.env.DEV;

export const logger = {
  error: (...args) => {
    if (isDev) console.error('[ChargeEV]', ...args);
  },
  warn: (...args) => {
    if (isDev) console.warn('[ChargeEV]', ...args);
  },
  info: (...args) => {
    if (isDev) console.info('[ChargeEV]', ...args);
  },
};

export default logger;
