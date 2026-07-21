# Phase 6.2 — Backend Performance Optimization

This backend had more already in place than the frontend did going into
Phase 6.1 — rate limiting, compression, and CORS were all already
substantially, correctly implemented from earlier work. Verified each
rather than assuming, and focused the real effort on the genuine gaps.

---

## Already correct — verified, not re-built

- **Rate limiting**: already comprehensive — dedicated limiters for login,
  register, forgot-password, and admin setup, plus a 300/15min baseline
  (`apiLimiter`) across the rest of `/api`. One real gap found (see below).
- **Compression**: `compression()` (gzip) already enabled globally in `app.js`.
- **CORS**: already correctly configured — no wildcard origin, a shared
  allow-list between Express and Socket.IO (so they can't drift apart), and
  correctly excludes `localhost` in production. This is genuinely
  production-grade as-is; nothing to fix.
- **Pagination on admin list endpoints**: `admin.controller.js`'s users,
  stations, and bookings lists all already use proper
  `Promise.all([findMany, count])` with `skip`/`take` for accurate totals.
- **Query field selection on admin lists**: already using `select`/`include`
  to avoid over-fetching in most places.

## Real gaps found and fixed

### 1. The public station list was leaking private data and wasting bandwidth
`GET /stations` (the main listing every visitor hits) had no top-level
`select` — just a bare `findMany` decorated with relation includes. That
means it returned, to every single visitor:
- **`totalRevenue`** — a station owner's private business data, with zero
  reason to be visible on a public listing (verified the frontend never
  even reads it there).
- **`ownerId`** — an internal foreign key, no reason to expose it.
- **The full `images` array** (up to 5 base64 photos per station) — verified
  the list page only ever renders `images[0]` as a card thumbnail; the rest
  was pure wasted payload on every page load, for every visitor.

Added an explicit `select` (excluding `ownerId`/`totalRevenue`), and since
Prisma can't slice a scalar array field at the query level, trimmed `images`
down to just the first entry after the fetch — that's what actually shrinks
the real HTTP response size. The station *detail* page's own query is
untouched — it correctly still needs the full gallery.

### 2. Database indexing
Reviewed every model. Most were already well-indexed with genuinely
well-designed compound indexes matching real query patterns (`Booking`'s
`[slotId, status, startTime]` for the overlap check, `Bid`'s two indexes,
`Payment`'s Stripe-lookup index, etc.) — this schema had clearly already had
real indexing thought put into it. Two real gaps:
- **`ChargingStation`** had no index at all beyond the unique `ownerId`,
  despite `status` being filtered on *every single call* to the public
  list (always `WHERE status = APPROVED`). Added
  `@@index([status, city])` — a compound index, since these two are almost
  always filtered together, and a query on just the first field (`status`
  alone) can still use it.
- **`Complaint`** had no index at all. Added `@@index([createdAt])`,
  matching the identical, already-existing pattern on `Log` — the admin
  inbox sorts newest-first with pagination, same need.

**Honest limitation**: couldn't run `prisma validate` or push these to a
live database — this sandbox can't reach the domain Prisma needs for its
query-engine binary (the same wall hit in Phase 5.1's test-suite work).
Reviewed both edits manually against the exact syntax pattern already
proven elsewhere in this same file rather than guessing. The real
correctness check is `prisma db push` on a real machine with normal
internet access.

### 3. Caching — in-memory, not Redis, and here's why
Same tension as Phase 6.1's React Query decision, and resolved the same
way: Redis is a whole separate service to provision and host, not just a
library — an even bigger addition than React Query would have been, against
the same "keep the tech stack" instruction from the start of this
engagement. Implemented a small in-memory TTL cache instead
(`utils/simpleCache.js`), applied to the one place it's clearly worth it:
the public station list — hit by every visitor, non-trivial to compute
(cross-station rating aggregation + in-JS filtering), and doesn't change
every minute.

Cached by the *exact* query (so different filters/pages never collide),
30-second TTL, and — more important than the TTL — **explicitly
invalidated** in both places the underlying data actually changes
(`updateStation` and the admin's approve/reject action), so a newly
approved station or an edit shows up immediately rather than waiting out
the cache window.

**Disclosed plainly, not glossed over**: this cache lives in the Node
process's memory. It does not survive a restart, and would not share state
across multiple server instances if this app is ever horizontally scaled —
each instance would keep its own separate cache. For the current single
Render web service, that's a real, acceptable trade-off. If this ever scales
to multiple instances, that's the point where Redis genuinely becomes the
right call, not before.

### 4. Rate limiting — one real gap
Complaints allow **guest (unauthenticated) submission** by design (verified
in Phase 5.1's e2e suite: "a GUEST (no token) can submit a complaint") —
which makes it the one write endpoint with zero auth friction standing
between it and an abuser, unlike everything else behind the general
limiter, which at least requires a registered account first. Submissions
land straight in a human inbox. Added a dedicated `complaintLimiter`
(10/15min), matching the exact style of the existing auth-endpoint limiters.

---

## Verified

- Syntax-checked every modified file directly (`node --check`).
- **Re-ran the full e2e suite after every backend change** — still 53/53
  passing, including the exact flows touched (station creation, admin
  approval, reviews/ratings) — a real regression check, not just a syntax
  check.
