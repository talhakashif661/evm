import Stripe from 'stripe';

// Singleton, matching the pattern used by prisma.js / socket.js. The Stripe
// SDK requires a non-empty string at construction time even if it's never
// used (an empty string throws immediately) — this fallback exists purely so
// importing this module doesn't crash the whole app when STRIPE_SECRET_KEY
// isn't set yet (e.g. in tests, or before real keys are added); any actual
// Stripe API call made with this placeholder will fail with an auth error
// from Stripe, not a local crash.
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder_not_a_real_key');

// Stripe wants amounts in the smallest unit of the currency (e.g. cents for
// USD, paisa for PKR) — both are 2-decimal currencies, so this is just x100.
export const toStripeAmount = (amount) => Math.round(amount * 100);

export const STRIPE_CURRENCY = (process.env.STRIPE_CURRENCY || 'pkr').toLowerCase();

// Local-dev-friendly payment mode. Real Stripe calls (createBookingPaymentIntent
// in booking.controller.js) get skipped in favor of an instant server-side
// simulated success (utils/paymentActivation.js) whenever:
//   - PAYMENT_MODE is explicitly "mock", or
//   - no real secret key is configured at all (unset or the .env.example
//     placeholder), so a fresh clone works out of the box with zero setup.
// Deploying with a real STRIPE_SECRET_KEY and PAYMENT_MODE unset (or "live")
// is enough to flip this to false — no other code changes needed.
export const isMockPayments =
  process.env.PAYMENT_MODE === 'mock' ||
  (!process.env.PAYMENT_MODE &&
    (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY === 'sk_test_replace_me'));

export const MOCK_PAYMENT_DELAY_MS = parseInt(process.env.MOCK_PAYMENT_DELAY || '1000', 10);

export default stripe;
