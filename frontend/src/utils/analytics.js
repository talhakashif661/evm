// Lightweight Google Analytics 4 (GA4) integration.
//
// No-ops entirely unless VITE_GA_MEASUREMENT_ID is set, and even then only in
// a production build, so local dev traffic never gets counted — same pattern
// as the Sentry wiring in logger.js.
//
// This is an SPA (React Router, no full page loads between routes), so the
// gtag.js snippet's own automatic pageview would only ever fire once, on
// initial load. `send_page_view: false` disables that, and trackPageView()
// is called explicitly on every route change instead (see App.jsx).

const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID;
const enabled = import.meta.env.PROD && Boolean(MEASUREMENT_ID);

let initialized = false;

export function initAnalytics() {
  if (!enabled || initialized) return;
  initialized = true;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  function gtag(...args) {
    window.dataLayer.push(args);
  }
  window.gtag = gtag;

  gtag('js', new Date());
  gtag('config', MEASUREMENT_ID, { send_page_view: false });
}

export function trackPageView(path) {
  if (!enabled || typeof window.gtag !== 'function') return;
  window.gtag('event', 'page_view', {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  });
}
