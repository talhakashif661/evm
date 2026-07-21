// A small in-memory TTL cache — chosen over Redis for the same reason the
// frontend used Redux's own `condition` option instead of React Query/SWR
// (see frontend/src/store/cacheCondition.js): Redis is a whole separate
// service to provision and host, not just a library, and the very first
// instruction of this engagement was to keep the tech stack as-is.
//
// Honest limitation, stated plainly rather than glossed over: this cache
// lives in the Node process's memory. It does NOT survive a restart, and
// does NOT share state across multiple server instances if this app is
// ever horizontally scaled (each instance would keep its own separate
// cache). For this app's actual current deployment — a single Render web
// service — that's a real, acceptable trade-off. If it's ever scaled to
// multiple instances, Redis (or another shared store) genuinely becomes the
// right call at that point, not before.
const store = new Map();

export function getCached(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

export function setCached(key, value, ttlMs) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

// Called whenever something that could appear in a cached list changes
// (a station gets approved/edited) — correctness over squeezing out the
// last bit of cache lifetime. Prefix-based so one call invalidates every
// cached filter/page combination for stations at once, not just one entry.
export function clearCacheByPrefix(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
