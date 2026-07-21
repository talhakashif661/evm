# Phase 6.1 — Frontend Performance Optimization

## The tech-stack tension, and how I resolved it

Two of this list's items — "Cache API responses with React Query or SWR"
and (implicitly) "virtual scrolling" via a library — would each add a new
dependency. The very first instruction of this whole engagement said to
**keep the tech stack as React, Redux Toolkit, Express, Prisma, MongoDB**.
I flagged this last turn rather than silently pick a side, and proceeded
with the lighter-weight path since that's what you confirmed. Both items
below deliver the actual underlying goal without a new library.

---

## 1. Code splitting — already done, verified

All 26 pages already use `React.lazy()` (confirmed in Phases 1.2 and 4.3).
No change needed.

## 2. Image optimization

- **Lazy loading**: already added in Phase 4.3.
- **Format**: switched the upload-compression pipeline (avatars, station
  photos) from JPEG to **WebP** — typically 25-35% smaller at equivalent
  quality. Checked the backend first: both the avatar and station-photo
  validators check a generic `data:image/` prefix, not JPEG specifically,
  so nothing server-side needed to change. `canvas.toDataURL()` silently
  falls back to PNG on the rare browser without WebP encoding support
  (per spec) — this can't break, worst case a bigger-but-valid image on an
  old browser.

## 3. Font optimization (preload critical fonts)

This needed more than adding a `preload` tag: Google Fonts' URLs are
dynamically generated, so you can't reliably preload a *specific* file
without knowing its exact hash in advance. Switched to **self-hosting**
Inter via `@fontsource/inter` (installed from npm — reachable even in this
sandbox, unlike some other domains I've hit walls on this engagement),
copied the 5 needed weights into `public/fonts/` for stable paths, wrote
real `@font-face` declarations, and added a genuine
`<link rel="preload" as="font">` for just the 400 weight (the one used for
body text almost everywhere — preloading all 5 would just spread the same
bottleneck instead of fixing it for the one that matters). This also drops
an entire third-party origin (`fonts.googleapis.com`) from the critical
path. Verified: `dist/fonts/*.woff2` land at the exact paths referenced.

## 4. Bundle size (tree shaking, remove duplicates)

Reviewed the full dependency list (19 packages) — no overlapping-purpose
libraries (no duplicate date/chart/icon/HTTP libraries). Vite/Rollup already
tree-shakes ES modules by default. The two largest chunks (`recharts`
~371KB, the general `vendor` chunk ~157KB) are already isolated to the
routes that use them via the existing code-splitting, so they don't affect
initial load — confirmed, not just assumed. Nothing to fix here.

## 5. React.memo — one real case, not a blanket application

Zero uses existed anywhere. Rather than wrap components reflexively, I
looked for where it actually matters: **`StationsMap`** — Leaflet
(re-)initialization is genuine, expensive DOM/canvas work, not a cheap
re-render. Wrapped it in `memo()` so `Stations.jsx` re-rendering for an
unrelated reason (e.g. a filter input's local state) doesn't force the map
to reinitialize when the `stations` array itself hasn't changed. Didn't
apply it elsewhere — most of this app's components either render once per
real data change already, or don't have expensive enough render work to
justify the added complexity memo brings (subtle bugs from stale closures,
harder-to-follow code) for no measurable benefit.

## 6. useCallback / useMemo — applied where genuinely warranted

Also zero uses existed. Applied `useMemo` to two real derived-value cases:
- `AuctionHub`'s `auctionStations` filter (recomputing a filter over the
  full stations array only when `stations` itself changes, not on every
  render) — worth noting the investigation here found this app already
  better-architected than I expected: `Countdown`'s per-second tick is
  already isolated to its own component state, so it was **not** actually
  causing `AuctionHub` to re-render every second the way I first suspected.
  Applied anyway as a correct, zero-cost, textbook-appropriate use, not to
  fix a problem that doesn't currently exist.
- `StationReport`'s new paginated-slice computation (see item 7).

**`useCallback` deliberately not force-applied anywhere**: it only changes
behavior when paired with a memoized child component or an effect's
dependency array — since `StationsMap` (the one component now wrapped in
`memo`) doesn't take function props, there's no second half for a
`useCallback` to connect to yet. Adding it without that pairing would be a
no-op that only adds complexity — not "using it where appropriate."

## 7. Virtual scrolling for long lists — real investigation changed the plan

Initially flagged two candidates (`UserHistory`, `StationReport`) based on
seeing `limit=1000`/`limit=200` fetches. Deeper investigation before touching
anything found these are **not the same problem**:
- **`UserHistory`**: the large `limit=1000` fetch is a **separate** function
  used only to compute aggregate stats (total sessions, energy, spend) — the
  actual rendered table already uses its own properly-paginated 15-item
  fetch with real page-number controls. Nothing to fix here; my original
  assessment was too hasty and I'm correcting it rather than "fixing" a
  page that was already fine.
- **`StationReport`**: genuinely different — the 200-item fetch populates
  the *same* state used for both the stats/chart calculations **and** the
  rendered table, with no slicing at all. This one really did render up to
  200 unbounded rows.

Rather than add a virtual-scroll library (the same new-dependency tension
as React Query), added **client-side pagination** to `StationReport`'s
table specifically — 15 rows per page, with page-number controls matching
`UserHistory`'s existing pattern exactly, so the app has one consistent
"long list" UI pattern instead of two different ones. The full dataset is
still fetched once (the chart/stats genuinely need the complete picture);
only what's *rendered* in the table is bounded.

## 8. Cache API responses — Redux-based, not React Query/SWR

See the tech-stack note at the top. Implemented using Redux Toolkit's own
built-in `condition` option on `createAsyncThunk` (no custom machinery, no
new library) — a fetch is skipped entirely if the same data was already
successfully fetched within the last 30 seconds.

Deliberately scoped to **two** slices, not all of them:
- **`fetchStations`** and **`fetchMyEVs`** — frequently revisited, no
  competing real-time listener, and brief staleness is a fully acceptable
  trade-off.
- **Explicitly not applied** to: `AuctionHub`/`Bookings`/`StationDetail`
  (all have active Socket.IO listeners that re-dispatch fetches in response
  to live events — a time-based skip could suppress a genuine update that
  arrives inside the cache window) or admin pages (correctness matters more
  than shaving a network round-trip when someone's about to block a user
  or approve a station).

Verified two things directly rather than assuming: (1) every call site for
these two thunks is fire-and-forget (`dispatch(...)`, never
`await`-ed-and-checked), so there's no risk of a condition-skip's action
shape breaking calling code; (2) freshness is only marked on **success**,
never on failure, so the "Try Again" retry buttons built in Phase 5.3
continue to retry immediately rather than being silently skipped.

---

## Verified

`npm run build` passes after every change in this phase, checked
incrementally. Font files confirmed landing at their exact referenced paths
in the actual `dist/` output.
