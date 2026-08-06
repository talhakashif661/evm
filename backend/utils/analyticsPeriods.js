// Shared time-bucketing for admin analytics line charts. Each period type
// walks backwards from "now" a fixed number of buckets — same fixed-window
// approach as the existing last-6-months chart on the admin dashboard
// (admin.controller.js's getDashboardStats), just generalized to three
// granularities instead of one.
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

const BUCKET_COUNT = { weekly: 8, monthly: 6, yearly: 5 };

export const VALID_PERIODS = ['weekly', 'monthly', 'yearly'];

export const normalizePeriod = (value) => (VALID_PERIODS.includes(value) ? value : 'monthly');

/**
 * Returns an array of { label, start, end } buckets, oldest first, covering
 * "now" in the last bucket. `start`/`end` are inclusive Date bounds.
 */
export const buildBuckets = (period) => {
  const count = BUCKET_COUNT[period] || BUCKET_COUNT.monthly;
  const now = new Date();
  const buckets = [];

  if (period === 'weekly') {
    const currentEnd = new Date(now);
    currentEnd.setHours(23, 59, 59, 999);
    for (let i = count - 1; i >= 0; i -= 1) {
      const end = new Date(currentEnd.getTime() - i * WEEK_MS);
      const start = new Date(end.getTime() - WEEK_MS + 1);
      buckets.push({
        label: start.toLocaleString('en', { month: 'short', day: 'numeric' }),
        start,
        end,
      });
    }
  } else if (period === 'yearly') {
    for (let i = count - 1; i >= 0; i -= 1) {
      const year = now.getFullYear() - i;
      buckets.push({
        label: String(year),
        start: new Date(year, 0, 1, 0, 0, 0, 0),
        end: new Date(year, 11, 31, 23, 59, 59, 999),
      });
    }
  } else {
    // monthly (default)
    for (let i = count - 1; i >= 0; i -= 1) {
      const d = new Date(now);
      d.setDate(1); // avoid end-of-month overflow (e.g. Jul 31 -> Jun 31)
      d.setMonth(d.getMonth() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      buckets.push({ label: start.toLocaleString('en', { month: 'short' }), start, end });
    }
  }

  return buckets;
};
