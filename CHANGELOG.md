# Changelog

> Prior engagement history lives in `CHANGELOG_FIXES.md`. This file tracks work
> from the current audit/overhaul engagement.

## [Unreleased] — Phase 11: backlog closeout (colors, DRY, coverage)

Cleared three of the four "deliberate open items" carried since Phase 10.
The fourth (Bootstrap removal) is still open **on purpose** — see the note
at the end.

### Design tokens — every hardcoded color is now in the palette

80 hex literals across 20 files replaced with CSS variables. The interesting
part wasn't the find-and-replace, it was resisting the obvious mapping:
badge backgrounds did *not* get pointed at `--success` / `--warning` /
`--danger`. Those are foreground colors, sized for text contrast against
cream. The muted surfaces they sit on are a different job, so they got their
own names (`--success-tint`, `--warning-tint-border`, …). Collapsing the two
sets is exactly how a codebase ends up shipping white-on-mint at 1.9:1.

Also added: `--star-filled` / `--star-empty` (the rating row can now be
retuned without touching body copy that happens to share the same brown),
`--chart-axis` / `--chart-grid` (chart furniture should recede further than
normal text — reusing `--text-secondary` made gridlines compete with the
data), `--on-dark`, and `--accent-gold-deep` for small gold text that the
standard gold is too light to carry at AA.

### DRY — extracted the duplicated pagination control

The station grid, booking history and owner revenue table had each grown
their own copy of the same page-number strip. Now one
`components/Pagination.jsx` with a `variant` prop, because the differences
between them were real (table footer with a divider rule vs. a standalone
block with its own margin) rather than accidental drift.

All three copies were also missing the same accessibility pieces — no
landmark, no `aria-current`, and no accessible name on the buttons (a bare
"3" tells a screen-reader user nothing). Fixed once instead of three times.

### Test coverage — 73 → 126 tests, 5 → 9 suites

Closed every "present but not directly tested" item from the status report:

- **`verification.otp.test.js`** (12) — the OTP flow, including the branch
  that actually flips `isVerified`. That one mattered most: KYC gates both
  booking and station listing, so a regression there silently locks every
  new user out of the product, and it had no assertion on it at all.
- **`ai-recommend.test.js`** (12) — the recommendation scorer. Written
  against ordering and relative score rather than exact numbers, so a future
  weight tweak doesn't produce a wall of red for no reason. Includes a guard
  that an unapproved station never surfaces — the fixture is priced at 1 and
  sits on the user's exact coordinates, so it would top the list the moment
  that filter regressed.
- **`ev-slot.crud.test.js`** (18) — CRUD plus the cross-user ownership
  guards. Every rejection test re-reads the row afterwards; a 403 that still
  mutated the record is worse than a 200 would be, and checking the status
  code alone can't tell those apart.
- **`socket.realtime.test.js`** (11) — real server, real clients, real
  loopback socket. The security assertions are the point: a client holding
  user A's token must *not* receive user B's notifications, and a
  client-supplied `join:user` must be ignored. A test that only checked
  "a message arrives" would have passed against the old, broken,
  client-driven room join too.

Added `socket.io-client` as a devDependency (the server already depended on
`socket.io`; the client half was only ever needed for this suite).

### Verification

126/126 tests, 9/9 suites · ESLint clean both sides · frontend production
build succeeds.

### Still open, deliberately

**Bootstrap removal stays paused.** It touches ~34 files and is the one
change in the backlog that no test, linter, or build can validate — the
suite stays green and the build stays clean while the layout quietly falls
apart. It needs a browser and a human eye, which is why it wasn't bundled
into this pass. Resume via the pilot-page approach in
`PHASE_10_BOOTSTRAP_REMOVAL_PLAN.md`: migrate one low-traffic page, look at
it, then continue.

## [Unreleased] — Debug pass: run-on-first-try robustness

Requested as a "senior debugger" pass: make the codebase run on the first
try without terminal/browser crashes, starting with static code analysis
(missing imports, undefined vars, case-sensitive path errors, bracket
errors).

- **Static analysis came back clean — nothing to fix.** Verified rather
  than assumed: a custom case-sensitive import resolver confirmed all 313
  relative imports across frontend and backend resolve to real files with
  exact-case paths (the check ESLint misses on a case-insensitive
  filesystem, and the one that catches "runs locally, crashes on the Linux
  deploy box"); `node --check` parsed every backend `.js` with no
  bracket/syntax errors; the frontend production build (esbuild — the
  authoritative JSX parse check) succeeded; ESLint clean both sides.
- **The one real crash-on-first-run issue was not a static one**, so it
  wouldn't have been caught by the above: even with `DATABASE_URL` set, the
  server could crash on the actual DB connection (or, on a fresh machine,
  an ungenerated Prisma client) with a raw stack trace. Hardened:
  - `server.js` now runs a preflight `SELECT 1` before `listen()`, so an
    unreachable database fails at boot with an actionable checklist instead
    of surfacing as an opaque 500 on the first request that hits the DB.
    Skipped under `NODE_ENV=test`.
  - `prisma.js` wraps client construction so an ungenerated client throws a
    legible `[FATAL]` "run prisma generate" message instead of a raw
    internal stack trace at import time.
  - New `npm run doctor` (`scripts/doctor.mjs`): a standalone preflight that
    checks the `.env` file, required vars, Prisma client generation, and
    live DB connectivity — each failure paired with its specific fix. Meant
    to be run before `npm start` on a new machine.
  - Widened the backend `format`/`format:check` globs to `**/*.{js,mjs}` so
    the new `.mjs` script stays covered.

### Verified
`npx eslint .` and `npx prettier --check` — clean (both). Custom import
resolver — 313/313 resolve case-sensitively. Full backend suite — 73/73,
unaffected (tests import `app.js`, not `server.js`). `npm run doctor`
correctly reports and explains the sandbox's own missing-engine-binary
state instead of crashing.

## [Unreleased] — Phase 10: Remove Bootstrap (scoping only)

Requested as a correction to a Phase 9.2 note that conflicted with the
Phase 1 tech-stack constraint. Confirmed as genuinely wanted and scoped as
its own phase rather than folded into deployment prep — see
`PHASE_10_BOOTSTRAP_REMOVAL_PLAN.md` for the full writeup.

- Measured the actual scope: 34/43 frontend files, 334 Bootstrap-ish
  className occurrences (104 grid, 111 form controls, 55 spacing
  utilities, 22 raw component classes), zero existing CSS Modules,
  227 KB of Bootstrap CSS shipped in full regardless of usage.
- Found buttons/cards/navbar/hero/footer/forms already have custom CSS
  overrides from Phase 2 — meaningfully lower risk than the raw numbers
  suggest. Badges/alerts/spinners/tables/dropdowns and `form-check`
  checkboxes don't, and are flagged as needing real design decisions
  during migration, not mechanical replication.
- Added `frontend/src/styles/grid.css` — a right-sized grid + utility
  layer covering exactly the measured tokens, matching Bootstrap's own
  breakpoints/spacing so the app's current responsive behavior doesn't
  shift. Purely additive: not imported anywhere yet, no existing page
  touched, Bootstrap's own CSS untouched.
- Deliberately did not touch any of the 34 existing files. This is the
  first phase in the engagement where the main risk — does it actually
  look right — can't be checked by anything available in this sandbox
  (no live browser, and the test suite only covers backend behavior).
  Plan recommends a pilot page with a real visual sign-off before
  migrating the rest.

### Verified
`npx eslint .` and `npm run build` (frontend) — clean, unaffected by the
new unused file. Full backend suite — 73/73, unaffected.

## [Unreleased] — Phase 9: Final Verification

Went through the 13-item verification checklist against the running tools,
not the prior phase summaries. Found and fixed a real gap along the way
(below); everything else is reported with actual evidence per item — see
this engagement's own handoff doc for why that matters here specifically.

- **Real bug found and fixed**: `npm test` (the actual unfiltered script,
  not the `jest e2e.smoke` filter this engagement had been running) failed
  — 3 of 5 suites (`auth.validation.test.js`, `booking-bid.guard.test.js`,
  `priority.scoring.test.js`) crashed on import with "Must use import to
  load ES Module" from the generated Prisma client. Root cause: unlike
  `e2e.smoke.test.js` and `health.test.js`, these three imported `app.js` or
  `bid.controller.js` directly instead of mocking `utils/prisma.js` first —
  so they transitively loaded the real `@prisma/client`, which can't
  initialize in this sandbox specifically (the query engine binary never
  downloaded, since `binaries.prisma.sh` is blocked — a limitation this
  engagement already knew about, just not that it reached this far). Fixed
  by applying the exact same `jest.unstable_mockModule('../utils/prisma.js',
  ...)` pattern the other two files already used, dynamically importing the
  app/controller afterward. `npm test` now genuinely passes: 5/5 suites,
  73/73 tests, real exit code 0 (double-checked directly — piping through
  `tail` had silently been masking a non-zero exit code earlier in this
  engagement's own verification runs, which is worth knowing for next time).

### Checklist status (each verified directly, not assumed)
1. All above phases complete — yes, per this and the Phase 8.2/8.3 entries.
2. `npm install` — frontend: clean. Backend: packages install fine, but the
   `postinstall` (`prisma generate`) step itself fails in this sandbox for
   the same `binaries.prisma.sh`-blocked reason above; the generated JS
   client lands but not the query engine binary. Expected to complete
   cleanly on a machine with normal internet access.
3. `npm run dev` — frontend: confirmed working (`VITE ready`, live GET to
   `http://localhost:3000/` returned 200 with real HTML). Backend: **crashes
   immediately** in this sandbox — `new PrismaClient()` throws synchronously
   without the query engine binary, so Express never even starts listening,
   confirmed via a live start/curl/kill cycle. Same root cause as #2, not a
   code defect — `prisma/schema.prisma`'s generator block is a plain
   `prisma-client-js` provider with no unusual `binaryTargets`, so this is
   expected to start cleanly on Render or any machine with real internet
   access. Recommend confirming this specifically outside this sandbox
   before considering deployment verification complete.
4. All tests pass (`npm test`) — yes, now (see fix above). 5/5 suites,
   73/73 tests.
5. Frontend build — clean, previously confirmed multiple times this
   engagement (most recently after the Sentry chunk-splitting change).
6. No errors in browser console — **cannot verify**; no live browser in
   this sandbox (an existing, already-documented limitation).
7. No 404 errors — partially checked at the code level: every static
   `Link`/`navigate` target in `pages/` and `components/` matches a route
   actually defined in `App.jsx`; no mismatches found. Genuine live-navigation
   404 testing isn't possible without a browser.
8. Mobile responsive — unchanged since Phase 5.4's code-level audit (same
   methodology and same disclosure: no live browser, so no real viewport
   testing was possible then either).
9. Color scheme matches cream/dark theme — confirmed: `index.css` defines
   `--bg-primary: #fdf8f0`, `--bg-dark: #1a1a1a`, `--accent-gold: #c9a96e`
   as the actual custom properties in use. A handful of components hardcode
   their own hex values for narrow, specific accents (star ratings, status
   badges) rather than the shared variables — not necessarily wrong, but
   worth a look if full palette centralization matters going forward.
10. CTAs clear and functional — code-level check only (no empty
    `onClick={() => {}}` handlers, no placeholder `href="#"` links, no
    leftover TODO/FIXME markers found); genuine interaction testing isn't
    possible without a browser.
11. SEO meta tags on every page — confirmed: all 26 page files under
    `pages/` render the `<SEO` component; zero missing.
12. Hero section looks professional — **cannot verify**; this is a visual/
    design judgment that requires actually seeing the rendered page, which
    this sandbox can't do.
13. No dead links or buttons — same code-level check as #7/#10 (routes and
    handlers all check out); can't be verified beyond that without live
    navigation.

### Verified
`npx eslint .` — zero problems (frontend and backend, re-confirmed after the
test-file fixes). `npm test` (backend, real unfiltered command) — 73/73
passing, exit code 0.

## [Unreleased] — Phase 8.3: Deployment Preparation

Checklist: production `.env` files, production API URLs, HTTPS, error
tracking (Sentry), analytics (GA or Plausible), Dockerfile (optional),
health check endpoint. Verified several of these were already done in
earlier phases without being labeled as such — see below. Remaining after
this entry: Dockerfile (optional, not yet started).

- **Already done, confirmed this phase**: health check endpoint (`/health`
  in `app.js`, runs a real `SELECT 1` against the DB and returns 503 on
  failure, already wired into Render's health check config per its own
  comment); production API URL handling (`frontend/src/utils/api.js` and
  `socket.js` both read `VITE_API_URL` with a `/api` local-dev fallback,
  never hardcoded); `.env.example` files for both frontend and backend
  already carry full inline production guidance for every variable. HTTPS
  is effectively handled by the Vercel/Render hosting choice itself (both
  provide it automatically for their URLs) — nothing in this app's own code
  assumes or requires plain HTTP.
- **Error tracking (Sentry)**: added `@sentry/react` (frontend) and
  `@sentry/node` (backend), wired into the exact hook point
  `logger.js`'s own comment already pointed to — every existing
  `logger.error(...)` call site across the whole app (including
  `error.middleware.js`'s central handler, which already wraps every
  unhandled route error) now reports to Sentry for free. No-ops entirely
  unless `VITE_SENTRY_DSN` / `SENTRY_DSN` is set, and even then only in a
  production build / when `NODE_ENV=production` — local dev never sends
  events. New env vars documented in both `.env.example` files.
  Frontend: gave Sentry its own Vite manual chunk (`vite.config.js`) rather
  than letting it bloat the main bundle — confirmed via a rebuild
  (88.41 kB / 29.88 kB gzip in its own chunk; main `index` bundle back to
  its pre-Sentry size).
- **Analytics (Google Analytics 4)**: added `frontend/src/utils/analytics.js`
  — a small hand-rolled gtag.js loader (matching this codebase's existing
  style of lightweight utilities over pulling in a wrapper library).
  `send_page_view: false` on init, since this is an SPA and the automatic
  pageview would only ever fire once on initial load; `trackPageView()` is
  instead called explicitly from `App.jsx` on every `location.pathname`
  change. No-ops entirely unless `VITE_GA_MEASUREMENT_ID` is set, and even
  then only in a production build.

### Verified
`npx eslint .` — zero problems (frontend and backend). `npx prettier
--check` — clean (both). `npm run build` (frontend) — clean, Sentry
confirmed in its own chunk. Full e2e suite — 54/54 passing, no regressions.

## [Unreleased] — Phase 8.2: Code Quality

Checklist: ESLint, Prettier, console.log audit, naming conventions, DRY pass,
component extraction. First four verified/addressed below (existing config
and code confirmed against the running tools rather than assumed — part of
this entry was assembled that way, since it had not actually been logged
yet); DRY pass and component extraction continue as separate work.

- **ESLint** set up from scratch for both `frontend/` and `backend/` (wasn't
  configured anywhere before). Flat config (`eslint.config.js`), matching
  ESLint v9's default. Both fully clean — zero problems.
  - Caught two false-positive sources in the tooling itself rather than
    trusting it blindly: a missing `eslint-plugin-react` caused ~300 false
    "unused import" warnings on genuinely-used JSX component imports;
    `eslint-plugin-react-hooks@7`'s "recommended" config bundles
    experimental React-Compiler-prep rules not applicable to this
    non-Compiler React 18 app (flagged the already-verified-correct
    `Countdown` component from Phase 6.1) — scoped down to the two stable
    rules (`rules-of-hooks`, `exhaustive-deps`).
  - Real bug fixed via linting: `AuctionHub.jsx`'s socket-room subscription
    effect depended on `stations.length` instead of the actual set of open
    slot IDs, so the socket could stay subscribed to a stale room if one
    auction closed while a different opened. Fixed with a derived key.
  - Genuinely dead code removed: a wasted `/stations/owner/revenue` API call
    in `StationReport.jsx` whose response was fetched and never used.
  - `PasswordStrengthBar`/`getPasswordStrength` extracted out of
    `Register.jsx` into `components/PasswordStrengthBar.jsx` (pure
    component) + `utils/passwordStrength.js` (scoring logic) — two files
    because Vite Fast Refresh only works cleanly when a file exports just
    components.
  - `npm audit fix` (backend) resolved 2 transitive-dependency
    vulnerabilities with no breaking changes.
  - `auth.middleware.js`'s empty catch now uses `logger.debug` (dev-only)
    instead of `.error` for expired/invalid JWTs — routine and expected, not
    a server problem, so it shouldn't add production log noise.

- **Prettier** installed and configured for both `frontend/` and `backend/`
  — one shared root-level `.prettierrc.json` (`semi: true`,
  `singleQuote: true`, `trailingComma: "es5"`, `printWidth: 100`,
  `tabWidth: 2`, `arrowParens: "always"`, `endOfLine: "lf"`), `format` /
  `format:check` scripts in both `package.json`s, `eslint-config-prettier`
  wired in last in both `eslint.config.js` files so ESLint's stylistic
  rules never fight Prettier. Full `prettier --write` pass applied to both
  codebases; `prettier --check` now reports clean on both.

- **console.log audit**: swept `frontend/src` and `backend/` for raw,
  un-gated `console.(log|warn|error|debug)` calls not already routed
  through the logger utilities. Frontend: none at all. Backend: exactly two
  legitimate exceptions, both CLI-only dev tooling outside the app's
  request lifecycle — `prisma/seed.js` and `scripts/setup-env.mjs` — left
  as-is since routing one-shot CLI output through the app's request-scoped
  logger would add nothing.

- **Naming conventions**: audited file-naming patterns across
  `frontend/src/{pages,components,utils}` and
  `backend/{controllers,routes,middleware,utils,validators,services}`.
  Frontend: fully consistent (PascalCase pages/components, camelCase utils)
  with no exceptions. Backend: fully consistent except
  `backend/middleware/validate.js` and `validateQuery.js`, which didn't
  follow the established `<name>.middleware.js` pattern used by the other
  three files in that folder (`auth.middleware.js`, `error.middleware.js`,
  `kyc.middleware.js`) despite being genuine Express middleware used the
  same way. Renamed both to match (`validate.middleware.js`,
  `validateQuery.middleware.js`) and updated their imports across all 6
  route files that use them.

### Verified
`npx eslint .` — zero problems (frontend and backend). `npx prettier
--check` — clean (both). Full e2e suite — 54/54 passing, no regressions
(re-confirmed again after the middleware rename specifically).

## [Unreleased] — Phase 8.1: Documentation

- **README.md**: added a "Design" section (real color tokens + rationale),
  two mockup images (`docs/screenshots/`) illustrating the hero and
  component system — generated from the actual color values and layout
  since this sandbox can't run a real browser against the live app to
  capture literal screenshots, and labeled honestly as mockups rather than
  passed off as real ones. Added a "Live Deployment" section stating
  plainly that nothing is deployed yet, rather than inventing a URL.
  Fixed real staleness: the rate-limit figure (was documented as 200/15min,
  actually 300/15min since Phase 6.2), and a from-scratch Payments/Stripe
  section — the previous README didn't mention Stripe anywhere despite it
  being a core feature. Tech stack table and security section updated with
  everything added across Phases 6–7 (self-hosted fonts, prop-types, magic-
  byte image validation, the email XSS fix, the CSRF architecture
  explanation).
- **API.md created** — a new, exhaustive reference for all 65 endpoints
  across every route file (the README's own "Key API Endpoints" section is
  now explicitly a shorter curated overview that points here for the full
  picture, with a note that this file wins if they ever disagree). Includes
  a rate-limits table verified against the actual configured values, not
  assumed.
- **CHANGELOG_FIXES.md**: kept as the unaltered historical record of the
  prior engagement rather than merging two different engagements' entries
  into one file — added a clear pointer at the top directing to this file
  (`CHANGELOG.md`) for everything from the current engagement.
- **Inline code comments**: audited the most algorithmically complex logic
  in the app (the booking race-condition reconciliation, the auction
  priority-scoring formula, the AI recommendation scoring) — all three
  already have substantive JSDoc/inline explanations from earlier phases'
  work, including the reasoning behind non-obvious past bug fixes. No gap
  found needing new comments.

### Verified
`npm run build` passes. Re-ran the full e2e suite: still 54/54 passing (no
backend code changed this phase — pure documentation — but confirmed
anyway before closing out this large a phase).

## [Unreleased] — Phase 7.3: Accessibility Testing

Full findings in `PHASE_7.3_ACCESSIBILITY_REPORT.md`. Two systemic,
app-wide gaps found and fully fixed; several items confirmed already
correct rather than assumed.

- **Color contrast**: computed real WCAG relative-luminance ratios (not
  eyeballed) for every key color pair. Found and fixed genuine failures —
  `--warning` (1.88:1 → fixed to clear 4.5:1+ everywhere it's used, not
  just badges), `--info` (2.91:1 → same treatment), `--text-muted`
  (3.27:1 → 4.82:1), plus a scoped fix for the Landing hero's small kicker
  chip specifically (left the shared `--accent-gold-dark` variable alone,
  since it's also correctly used elsewhere for large text that only needs
  the relaxed 3:1 threshold).
- **Modal component fully rebuilt** — used by all 13 modal instances
  app-wide, so this one fix applies everywhere at once. Added: Escape-to-
  close (was completely missing), `role="dialog"`/`aria-modal`/
  `aria-labelledby` (none of this existed), a real `aria-label` on the
  close button (was a bare, unlabeled "×"), focus moving into the dialog on
  open and returning to the trigger on close, and a basic Tab/Shift+Tab
  focus trap.
- **Form labels — 58 across 11 files, zero had `htmlFor`.** Fixed all of
  them, checked individually rather than mechanically: 52 straightforward
  `id`/`htmlFor` pairs, 5 converted to `fieldset`/`legend` where the label
  actually described a group of controls (a checkbox picker, an upload
  widget, a 5-button star rating) rather than one, and 1 needed no change
  (already correctly nested). `AddressAutocomplete` needed a small update
  to accept and forward an `id` prop.
- **Verified already correct** (checked before assuming): the global
  `:focus-visible` outline ring already correctly applies to form inputs
  despite their own `outline: none` (CSS specificity resolves it right);
  alt text app-wide is still clean (re-swept, same result as Phases 1.2/4.3).
- **Checked rather than assumed** on decorative icons: read lucide-react's
  actual source — its icons have no accessible name by default (no `role`,
  no `aria-label`, no `<title>`), so they aren't actively causing confusing
  screen-reader announcements in most modern setups. Reported this honestly
  rather than run an exhaustive `aria-hidden` pass for marginal benefit.

### Verified
`npm run build` passes after every change across this phase. Final sweep:
zero labels remain without either `htmlFor` or a `fieldset`/`legend`
conversion.

## [Unreleased] — Phase 7.2: Edge Cases to Test

Full findings in `PHASE_7.2_EDGE_CASES_REPORT.md`. Two real, fixed gaps;
one architectural trade-off disclosed rather than silently accepted.

- **Concurrent bookings**: the existing overlap test was sequential (await
  A, then send B), which cannot prove the app's own "optimistic insert,
  then deterministic reconcile" logic — a pattern the code's own comment
  explicitly built for MongoDB's lack of exclusion constraints — actually
  holds under a real race. Added a genuine `Promise.all`-based concurrent
  test. It passed: exactly one request wins, the database ends up with
  exactly one live booking. Fixed one downstream test whose hardcoded
  booking count needed updating to reflect the new test's (correct,
  intentional) surviving booking.
- **File upload type validation**: was a pure string-prefix check on the
  data URL's *declared* type, not its actual bytes — a direct API call
  (bypassing the browser) could send mislabeled data. Low realistic
  severity (no server-side image processing exists to exploit), but a real
  gap. Added zero-dependency magic-byte verification (JPEG/PNG/WebP
  signatures) to both the avatar and station-photo upload paths, tested
  directly against both a real image signature and mislabeled plain text.
- **XSS via email — a real, fixed gap.** The website itself is well
  XSS-resistant (React auto-escapes; zero uses of `dangerouslySetInnerHTML`
  anywhere). But registration names are validated only as non-empty
  strings, and get interpolated raw into transactional email HTML — a
  different code path that doesn't auto-escape. Fixed with a tagged
  template literal that auto-escapes every interpolated value across all
  12 email templates, with one marked exception for a fixed (non-user)
  HTML snippet that needed to stay unescaped.
- **NoSQL injection**: confirmed no raw MongoDB queries anywhere, and the
  classic operator-injection vector is already blocked by
  express-validator's `.isEmail()`/`.trim()` requiring string input.
- **Session timeout, network disconnection, empty database**: all verified
  already correct/handled from earlier phases — no changes needed.
- **CSRF**: verified the auth model is purely header-based (no cookies),
  which structurally means CSRF doesn't apply here — not something to add
  a token mechanism for. Disclosed the related, separate trade-off
  honestly: the JWT lives in `localStorage`, the standard XSS-vs-CSRF
  trade-off inherent to that choice, not silently glossed over.

### Verified
Re-ran the full e2e suite after every change: 54/54 passing (up from 53 —
one genuinely new test, not a rename).

## [Unreleased] — Phase 7.1: Test All Core Flows

Full test plan and results in `PHASE_7.1_TEST_PLAN.md`. No code changes this
phase — pure verification, backed by re-running the live e2e suite (53/53
passing) and direct code tracing for anything the suite can't reach.

Of ~20 named sub-steps across the User/Admin/Auction flows: 14 fully
live-tested, 5 code-verified (correct, traced, but pure frontend-rendering
concerns an HTTP-based backend suite can't exercise), and a handful of
specifically-named, honest gaps:
- Email verification is a hard KYC gate, not optional/toggleable as
  "(if enabled)" implied — its *enforcement* is live-tested; the OTP
  send/verify happy path itself isn't.
- Station Detail has no embedded map (the map is on the Stations list page
  only) — a real, minor mismatch with the checklist's expectation.
- "Filter by location/type" — there's no "type" filter; only city/name/
  price/rating.
- Admin "manage station listings" = approve/reject only, not full edit
  (that's the owner's capability by design).
- Admin promotion isn't e2e-tested (confirmed again from Phase 5.1, not
  newly found).
- Live Socket.IO delivery and email notification delivery (auction win,
  etc.) are correct, traced code, but not exercised by an automated test —
  the HTTP-based e2e suite can't test a live socket connection or actual
  email delivery.

None of these are bugs — they're places where "the code is right" and "an
automated test proves it end-to-end" are different claims, called out
precisely rather than rounded up to a blanket "all flows verified."

### Verified
Re-ran the full e2e suite fresh for this phase: 53/53 passing.

## [Unreleased] — Phase 6.3: Build Optimization

Full findings in `PHASE_6.3_BUILD_OPTIMIZATION_REPORT.md`.

**Worth stating plainly**: `webpack-bundle-analyzer` is a Webpack-specific
plugin; this project builds with Vite/Rollup, a different bundler entirely.
Not a preference call like the React Query/Redis decisions — the tool
simply can't attach to this build. Implemented the real Rollup-ecosystem
equivalent instead.

- **Minification, asset hashing, vendor chunk splitting**: all verified
  empirically (rebuilt from a clean `dist/`, read the actual output) rather
  than assumed from memory — all three were already fully, correctly done.
  Vendor chunking in particular was already deliberately configured with
  good reasoning (splitting React/Router and Redux into their own chunks
  specifically so an app-code-only deploy doesn't bust the browser's cache
  of the larger, more stable vendor bundle).
- **Bundle analysis**: added `rollup-plugin-visualizer`, generating an
  interactive treemap (`dist/bundle-analysis.html`). Gated behind a new
  `npm run build:analyze` script (opt-in only) rather than every build —
  `dist/` is what actually deploys, so an unconditional analyzer would mean
  this internal artifact sits at a public URL in production after every
  deploy. Verified both paths directly: normal `build` genuinely excludes
  the file, `build:analyze` genuinely includes it. Documented the new
  script in `DEPLOYMENT.md`.

### Verified
Both build paths tested directly, not assumed from the config alone.

## [Unreleased] — Phase 6.2: Backend Performance Optimization

Full findings in `PHASE_6.2_BACKEND_PERFORMANCE_REPORT.md`. This backend had
more already in place than expected — rate limiting, compression, and CORS
were all already correct; verified rather than re-built.

- **Query optimization**: `GET /stations` (public listing) had no field
  selection — returned `totalRevenue` and `ownerId` (private owner data,
  never used by the frontend there) to every visitor, plus all 5 possible
  station photos when the list view only ever renders the first one. Added
  an explicit `select` and trimmed `images` to one entry after the fetch
  (Prisma can't slice a scalar array at the query level, so this is done
  post-fetch — still genuinely shrinks the response sent over the network).
- **Database indexing**: reviewed every model — most already had
  well-designed compound indexes matching real query patterns. Two real
  gaps: `ChargingStation` had none at all despite `status` being filtered
  on every list call (added `@@index([status, city])`); `Complaint` had
  none (added `@@index([createdAt])`, matching `Log`'s existing pattern).
  Disclosed honestly: couldn't run `prisma validate`/`db push` in this
  sandbox (same Prisma-engine-binary network wall as Phase 5.1) — reviewed
  both edits manually against this file's own proven syntax instead.
- **Caching**: same tech-stack tension as Phase 6.1's React Query decision,
  resolved the same way — Redis is a separate service to host, not a
  library, so implemented a small in-memory TTL cache instead
  (`utils/simpleCache.js`), applied to the public station list specifically.
  Explicitly invalidated on station edit/approval (not just left to expire),
  so changes show up immediately. Disclosed the real limitation: doesn't
  survive a restart or share state across multiple instances — an
  acceptable trade-off for the current single-instance deployment, and
  exactly the point where Redis would become the right call if that changes.
- **Rate limiting**: found one real gap — complaints allow guest
  (unauthenticated) submission by design, making it the one write endpoint
  with no auth friction at all. Added a dedicated `complaintLimiter`
  (10/15min), matching the existing auth-endpoint limiter style exactly.
- **Pagination, compression, CORS**: verified already correct app-wide;
  no changes needed.

### Verified
Syntax-checked every modified file. Re-ran the full e2e suite after each
change — still 53/53 passing, including the exact flows touched (station
creation, admin approval, reviews).

## [Unreleased] — Phase 6.1: Frontend Performance Optimization

Full findings in `PHASE_6.1_PERFORMANCE_REPORT.md`, including how a real
tech-stack tension (React Query/SWR vs. "keep the tech stack" from the very
start of this engagement) was resolved.

- **Code splitting**: already fully done — verified, no change.
- **Images**: lazy loading already done (Phase 4.3); switched the upload
  pipeline from JPEG to WebP (25-35% smaller at equal quality). Backend
  validators use a generic `data:image/` check, so no server changes needed.
- **Fonts**: switched from Google Fonts' CDN to self-hosted `@fontsource/inter`
  (copied into `public/fonts/`), enabling a genuine `<link rel="preload">` on
  the critical 400 weight — not achievable with Google's dynamically-generated
  URLs. Also drops a third-party origin from the critical path.
- **Bundle size**: reviewed all 19 dependencies — no duplicated-purpose
  libraries; Vite already tree-shakes; the two largest chunks (recharts,
  vendor) are already isolated via existing code-splitting. Nothing to fix.
- **React.memo**: applied to one genuine case, `StationsMap` (Leaflet
  re-initialization is real, expensive work) — not blanket-applied elsewhere.
- **useMemo/useCallback**: applied `useMemo` to two real derived-value cases
  (AuctionHub's station filter, StationReport's new pagination slice).
  Discovered `Countdown` already isolates its own per-second re-render (not
  cascading to `AuctionHub` as initially suspected) — applied useMemo anyway
  as a correct, zero-cost practice, not to fix a problem that didn't exist.
  Deliberately did **not** force `useCallback` anywhere — it only changes
  behavior paired with a memoized child or effect dependency, and no second
  half exists yet for it to connect to.
- **Virtual scrolling**: investigation changed the plan. `UserHistory`'s
  large fetch turned out to be aggregate-stats-only (the actual table was
  already properly paginated) — correcting an earlier too-hasty assessment
  rather than "fixing" a page that was fine. `StationReport` was the real
  case (200 unbounded rows in the same state used for stats); added
  client-side pagination matching `UserHistory`'s existing pattern, rather
  than a new virtual-scroll library.
- **API response caching**: implemented via Redux Toolkit's own `condition`
  option (no new dependency) instead of React Query/SWR, per the tech-stack
  constraint. Scoped to `fetchStations`/`fetchMyEVs` only — deliberately
  excluded pages with active Socket.IO listeners (a time-based skip could
  suppress a real live update) and admin pages (correctness over latency).
  Verified retries still work: freshness is only marked on success, never
  on failure.

### Verified
`npm run build` passes after every change, checked incrementally.

## [Unreleased] — Phase 5.4: Mobile Responsiveness Audit

Full findings and methodology (a code-level audit, not a live-browser test —
disclosed upfront) in `PHASE_5.4_MOBILE_AUDIT_REPORT.md`.

### Fixed
- **Every form input was triggering iOS Safari's auto-zoom on focus** —
  `.form-control`/`.form-select` were 15.2px (0.95rem at this app's 16px
  base), crossing the specific threshold that makes iOS auto-zoom the
  viewport. Bumped both to a true 16px. Affected every form in the app.
- **Modals were nowhere near full-screen on mobile** — did the math: on a
  320px phone, overlay + modal padding left only ~216px of real content
  width. Added a mobile bottom-sheet treatment (full width, anchored to the
  bottom, rounded top only) via a new `modal-panel` class — one shared
  `Modal` component, so this covers all 13 modal instances app-wide at once.
- **Two hardcoded `1fr 1fr` grids that never collapse** (Register's
  First/Last Name, Contact's Name/Email) — added a shared
  `.form-grid-2col` class that stacks under 480px.
- **Bare Bootstrap `col-6` on form field pairs** (OwnerDashboard's
  City/Price and Latitude/Longitude ×2 forms, MyEVs' Battery
  Capacity/Current Level) — `col-6` with no breakpoint prefix never
  collapses on its own. Changed all 10 instances to `col-12 col-sm-6`.
  Explicitly did **not** apply this to `col-6 col-md-3` `StatCard` tiles or
  Footer's link columns — checked the actual content first, and short
  label+number tiles / short stacked links are genuinely fine at
  half-width even on a 320px phone; that's a deliberate pattern, not a bug.

### Verified already correct (no changes needed)
- All 8 tables app-wide already wrap in `overflowX: auto`.
- Every genuine card-grid column class starts from `col-12` (full grep
  sweep, not a sample).
- 44px button touch targets (Phase 3.2) confirmed still intact.
- Navbar mobile panel: already 16px font, ~51px touch targets per link.
- Hero mobile breakpoint (Phase 2.3) already correct.
- `.page-container`'s 1200px cap already prevents awkward stretching on
  1440px+ screens.
- No hardcoded widths or oversized `min-width` values found that would
  force page-level horizontal scroll.

### Disclosed limitation
Real rendering behavior (exact wrapping, font metrics, perceived jank) needs
an actual browser or device — flagged clearly rather than claimed as tested.

### Verified
`npm run build` passes after every change, checked incrementally.

## [Unreleased] — Phase 5.3: Missing Features to Add

All 19 items across the four categories. Most gaps were real; a few items
were already done and are noted as verified rather than re-built.

### Loading States
- **Skeleton loaders** added to the 8 pages that only had spinner text:
  `AdminDashboard`, `AdminUsers`, `AdminBookings`, `AdminStations`,
  `OwnerDashboard`, `MyEVs`, `StationDetail`, `StationReport`. Each is
  shape-matched to that page's real content (stat-card rows, chart+table
  combos, card grids) rather than a generic placeholder. Every page in the
  app now has one.
- **Form-submission spinners**: Login, Register, and Profile Update already
  had proper disabled+"...ing" states — verified, no change needed.
- **File-upload progress**: Profile's avatar and OwnerDashboard's
  station-photo uploads already had spinner-based busy states (not a gap).
  Enhanced the multi-file uploader specifically with a real
  "Compressing photo 2 of 3..." counter, since it processes several images
  in sequence and a bare spinner doesn't convey that.

### Error Handling
- **A real, systemic bug**: found 4 places where a failed data fetch was
  completely silent — no toast, no error message, and the page showed the
  exact same empty state as a genuine empty result (`fetchMyBookings`,
  `fetchStations`, `fetchMyEVs`, `fetchRecommendations`). Fixed at both the
  slice level (added the missing toast, matching every other slice's
  pattern) and the page level (Bookings, Stations, MyEVs, AI Recommend now
  render a distinct "couldn't load, try again" state with a real retry
  button — this doubles as the "retry logic for failed API calls" item).
  Caught via a wide-window recheck after an initial narrow scan produced
  several false positives (`registerUser`, `loginUser`, `sendOTP`, etc. all
  already toast correctly, just a few lines further down than first checked).
- **Error boundaries**: was a single one at the app root — any error
  anywhere replaced the *entire* app with one fallback screen. Added a
  second, route-level boundary around just the page content, so Navbar/
  Footer survive a page-level crash. Also fixed the boundary's "Go Home"
  button, which was still using raw pre-button-system styling — the same
  bug class fixed in `NotFound.jsx` back in Phase 3.3.
- **Offline detection**: new `OfflineBanner` component (`navigator.onLine` +
  the `online`/`offline` window events), mounted globally — a persistent
  banner, not a toast, since "why are my actions failing" shouldn't be
  something that can be missed or auto-dismisses.

### Empty States
- "No stations found" / "No bookings yet" — already done in Phase 3.3.
- **"No auctions active"**: adapted rather than implemented literally — a
  bare "Create Auction" button doesn't work from a blank list (you open an
  auction on a specific slot from your station page, not from here), so
  station owners now see "Manage My Station" instead, others see the
  original message. Role-aware, not a generic CTA slapped on regardless of
  who's looking.
- **"No history"**: replaced a bare one-line message with real educational
  content (energy tracking, cost breakdown, usage trends) plus a "Find a
  Station" CTA.

### Notifications
- Toast coverage: fixed as part of the Error Handling section above.
- **Bid-won**: was already a toast, but the generic 3-second default
  (confirmed in `main.jsx`) is too brief for something this consequential —
  a winning bid auto-creates a booking that still needs checking in and
  paying for. Now stays up 12s and links straight to "View My Bookings".
- **Sound on bid win (optional)**: implemented as a short, synthesized
  two-note chime via the Web Audio API — no audio file to host, fails
  silently on unsupported browsers, and only ever plays for this one rare,
  celebratory event.

### Form Enhancements
- **Register**: added a confirm-password field, real-time touched-based
  inline validation (name/email/password/confirm), and a password-strength
  bar. Found and fixed a 6th instance of the stale "EV Management System"
  branding in the subtitle while in there.
- **Password strength** built as a shared, exported piece so `ResetPassword`
  could reuse the identical bar — also added real-time "passwords don't
  match" feedback there (it already had a confirm field, just no live check).
- **Datetime picker**: added a `min` (now) constraint on the booking modal.
  Checked the backend validator first — there's no max-advance-booking rule
  server-side, so no `max` was invented to match a constraint that doesn't
  exist.
- **Address autocomplete**: built using Nominatim (OSM's free geocoding
  search — the same no-API-key approach already used for the map/tiles),
  wired into both the create- and edit-station forms. This fixes something
  worse than the checklist named: station owners were previously typing raw
  decimal latitude/longitude by hand with no assistance at all. Selecting a
  suggestion now fills address, city, and both coordinates at once; manual
  entry still works as a fallback.

### Verified throughout
`npm run build` passes after every individual change in this phase, not
just at the end — each item was rebuilt and confirmed before moving to the
next.

## [Unreleased] — Phase 5.2: Find and Fix Dead Features

Full findings in `PHASE_5.2_DEAD_FEATURES_REPORT.md`. No code changes this
phase — everything found was either clean or a genuine decision-point
flagged for you rather than something to silently patch.

- **Unused components/routes**: none found. All 13 component files are
  genuinely used; every registered route has a real navigational path to
  it once data-driven nav arrays (`Navbar`'s role-based link arrays,
  `AdminLayout`'s `navItems`, a Dashboard quick-action tile) are accounted
  for — a first-pass literal-string grep wrongly flagged several of these
  as unreachable; corrected by checking the actual arrays.
- **API endpoints with no frontend integration**: found 2. `GET
  /payments/status/:transactionId` is fully orphaned (correctly built,
  zero frontend calls) — left as-is rather than delete working, scoped
  backend code unilaterally. More importantly: `deleteReview`'s admin-
  moderation branch (dedicated audit-log message, `isAdmin` check) has
  **no admin UI anywhere** to reach it, and there isn't even a
  platform-wide review-listing endpoint yet (only per-station) — a real
  feature gap, flagged rather than built without being asked.
- **"View Details" links**: only one instance exists anywhere in the app;
  already confirmed working in the Phase 3.1 audit.
- **Navigation paths**: every `to=`/`navigate()` target (including
  data-driven ones) matches a real registered route. No dangling links.
- **Modals**: all 12 instances across `OwnerDashboard`, `MyEVs`,
  `Bookings`, and `StationDetail` checked for both an open trigger and a
  close mechanism — all 12 have both.

## [Unreleased] — Phase 5.1: Verify All Features from Project Summary

Full findings in `PHASE_5.1_VERIFICATION_REPORT.md`. Ran the real backend
test suite (not just code reading) — 53 live assertions executed and passing.

### Bug found and fixed: every transactional email was still pre-rebrand
Found while verifying "Forgot/Reset password with SendGrid": all 11 email
templates in `backend/utils/email.js`, plus a second, separate OTP template
in `backend/services/verification.service.js`, were still on the old green
palette and "EV Management" branding — the one place the pre-rebrand
identity would have reached real users. Retheme + rebrand applied to all 12
templates (old colors → the real cream/gold/dark palette; "EV Management
[System/Team]" → "ChargeEV" everywhere, including subject lines). Verified:
`node --check` on both files, then re-ran the e2e suite — still 53/53,
confirming this only changed appearance/text, not behavior.

### Verified with live test execution (not just reading code)
- Installed backend deps, ran `npm test`: **`e2e.smoke.test.js` passes 53/53**
  — admin bootstrap, registration, role guards, KYC gating, station
  approval, bookings with overlap rejection, check-in, Stripe webhook
  idempotency, the full auction flow including the priority-scoring formula,
  admin audit logs, complaints, and the review system.
- The other 3 suites (`priority.scoring`, `auth.validation`,
  `booking-bid.guard`) failed to even start — but for an identical,
  environment-specific reason (this sandbox can't reach
  `binaries.prisma.sh` to download Prisma's query engine; tried the
  official workaround, still blocked). Not a code defect — resolves
  automatically on a real machine with normal internet access. Flagged
  clearly rather than glossed over.
- Fixed `backend/tests/README.md`, which was stale — it described
  `e2e.smoke.test.js` as not built yet, but that file was added after the
  README was written.

### Verified via direct code reading
- **Profile Redux sync**, **avatar 50KB limit** (enforced independently by
  both client and server, confirmed exact number both places), **map view**
  (real react-leaflet + OpenStreetMap tiles + real `fitBounds`),
  **Socket.IO** (all 9 distinct events matched between backend `emit` and
  frontend `listen`, correctly room-scoped), and **express-validator**
  (confirmed wired on all 6 originally-named routes) — all check out.
- **Admin promotion**: route/controller is implemented correctly (proper
  checks + audit logging), but isn't covered by the automated test suite —
  a real, flagged gap in coverage, not in the feature itself.
- **MongoDB persistence**: correct at the code level (real Prisma models,
  no in-memory arrays standing in anywhere) — but, same as the prior
  engagement's own summary noted for itself, this sandbox has no route to
  a live MongoDB Atlas, so an actual live round-trip couldn't be confirmed
  here. Disclosed rather than papered over.

## [Unreleased] — Phase 4.3: SEO Best Practices

### A real bug found while auditing semantic HTML
`App.jsx` had a `useEffect` directly setting `document.title` from an old,
**incomplete** `TITLES` map (missing `/`, `/stations`, every `/admin/*` and
`/owner/*` route) — running independently of, and potentially racing with,
the `SEO` component from Phase 4.1. Removed entirely; `SEO.jsx` now solely
owns this for every page. Also removed the now-unused `useEffect` import.

### 1. Semantic HTML5 structure
Better shape than expected: `<nav>`, `<main>`, and `<footer>` were **already**
correctly semantic. Landing's three page sections already used `<section>`.
What was missing: `<article>` — zero uses anywhere. Added it to the two
clearest, correct cases (self-contained, repeatable content units, not just
"any list row"): Stations' station cards and Station Detail's review items —
`motion.div` → `motion.article` (framer-motion supports every HTML tag this
way, so this is a pure tag swap, not a behavior change).

### 2. Heading hierarchy (h1 > h2 > h3, never skip)
Audited all 26 pages. **13 had real skips** (h1 straight to h3 or h4) and one
(`VerifyEmail`) had **no h1 at all**. Fixed all 13, checking context for each
rather than blind-renaming — e.g. Station Detail's per-slot heading was
correctly nested one level under an existing "Available Slots" h2, so that
one was *demoted* h4→h3, not promoted to h2 like the others. Every heading's
size comes from an inline `fontSize` rather than the tag's default styling,
so none of these fixes changed how anything looks — verified by re-running
the audit after: zero skips remain anywhere.

### 3. Image alt attributes
Re-swept the whole app: still clean from the Phase 1.2 audit, nothing new
introduced since. No action needed.

### 4. Descriptive link text
Zero instances of "click here" / bare "here" / "read more" anywhere. No
action needed.

### 5. Mobile responsiveness / Core Web Vitals
Honest limit: actual Core Web Vitals (LCP, INP, CLS) need a **live** page
load to measure — not something a static-code review can produce, and I
won't claim a number I can't back up. What *is* verifiable from code and
already in good shape: viewport meta tag, responsive breakpoints throughout
`index.css`, `font-display: swap` on the Google Fonts load. The lazy-loading
and code-splitting work below are the concrete, code-level levers that
actually move these metrics.

### 6. Page speed — lazy loading, code splitting, compression
- **Code splitting**: already 100% in place — confirmed all 26 pages use
  `React.lazy()` in `App.jsx`, not just some.
- **Lazy-loading images**: was completely absent (checked — zero `loading=`
  attributes anywhere). Added `loading="lazy"` to the Stations list card
  images, review avatars, and station-photo upload previews. Station Detail's
  photo gallery keeps its *first* photo eager (a legitimate LCP candidate)
  and lazy-loads the rest — not a blanket rule, since eagerly deferring the
  very image likely visible on load would be counterproductive.
- **Compression**: `compression()` middleware already enabled server-side
  (`app.js`); Vite's build already minifies/hashes assets (confirmed in
  Phase 1.2). No action needed.

### 7. Sitemap.xml and robots.txt
- `frontend/public/robots.txt` — added, disallowing the 22 private routes
  (mirroring the `noIndex` list from Phase 4.1 exactly) and referencing the
  sitemap. Domain is a clearly-marked placeholder (matching this project's
  own existing `your-backend.onrender.com` convention in `.env.example`) —
  a real one can't be known from this dev sandbox.
- **Sitemap is dynamic, not a static file** — and this was a deliberate call,
  not a shortcut. A static file can only ever list the 4 fixed pages
  (`/`, `/stations`, `/about`, `/contact`); it can never include real station
  detail pages, which is most of this app's actual content and which Phase
  4.1 explicitly marked indexable. Added `GET /sitemap.xml` to `backend/app.js`
  (same simple, unauthenticated pattern as the existing `/health` endpoint),
  querying real `APPROVED` stations via Prisma and using `CLIENT_URL` — the
  same env var already used elsewhere in this file for CORS — rather than a
  hardcoded domain. Verified the XML-generation logic directly with sample
  data (see terminal output); couldn't test the live DB query itself in this
  sandbox.
- Because the frontend and backend are separately deployed (Vercel /
  Render), added a `rewrites` entry in `vercel.json` proxying
  `/sitemap.xml` to the backend's dynamic route, so it's reachable at the
  frontend's own domain root, where search engines expect it — documented in
  `DEPLOYMENT.md`'s Vercel step, including the one manual thing left to do
  (swap the placeholder Render URL for the real one before going live).

### 8. No duplicate content across pages
Checked directly: every one of the 26 pages' meta titles and descriptions are
unique (grep + `uniq -c`, every count came back 1). Combined with Phase 4.1's
canonical tags, this is in good shape — no action needed beyond confirming it.

### 9. Proper 301/302 redirects for moved content
Found `/owner/slots` and `/owner/bookings` were **client-side-only** redirects
(React Router `<Navigate replace>`) — these return a 200, not a real 301, to
anything that doesn't execute the page's JS, which Google's own guidance
flags as worse than a real redirect for exactly this reason. Added real 301s
for both in `vercel.json`'s `redirects` array (edge-level, before the SPA
even loads) — kept the existing client-side `<Navigate>` too, as a fallback
for hosts other than Vercel.

### Also fixed along the way
Found the same "leftover from before the ChargeEV rebrand" pattern twice
more (after `index.html`'s stale title and dead font in Phase 4.1): the
title lines in `DEPLOYMENT.md` and `README.md` still said "EV Management
System". Fixed both titles only — `README.md`'s full content rewrite is
explicitly Phase 8.1's job, not this one.

### Verified
- `npm run build` passes with every change in this phase.
- Heading-hierarchy audit re-run after fixes: zero skips remain, confirmed
  per-file.
- `vercel.json` confirmed valid JSON with correct rewrite ordering (the
  sitemap rule sits above the catch-all, so it isn't shadowed).
- `robots.txt` confirmed present in the actual `dist/` build output.

## [Unreleased] — Phase 4.2: Structured Data (JSON-LD)

### Added
- `frontend/src/components/JsonLd.jsx` — shared component, renders one or
  more schema.org blocks via `react-helmet-async`.
- `frontend/public/logo.png` — new **square** (512×512) logo mark, generated
  for `Organization.logo`. The Phase 4.1 `og-image.png` is a wide banner
  (1200×630) — wrong aspect ratio for a "logo" property, so this is a
  separate, purpose-built asset rather than reusing the wrong shape.

### Organization schema (Landing page)
Every field is real, verified against the actual codebase before writing it:
- `contactPoint` reuses `CONTACT` from `contactInfo.js` — the same
  phone/email already shown on the Contact/About pages and Footer.
- **No `sameAs` property.** Checked `Footer.jsx` first — the only external
  links anywhere in the app are WhatsApp/email/phone (click-to-contact), not
  social media profiles. Schema.org's `sameAs` is for linking to a real
  profile page (Twitter/Facebook/LinkedIn/etc.); since none exist, adding
  fake ones would be structured-data fabrication. Omitted rather than invented.
- `url`/`logo` resolve against the real current origin, same reasoning as
  Phase 4.1's `SEO` component — this app has no permanent domain yet.

### Product schema (Station Detail pages)
- `offers.price` / `priceCurrency` (PKR) / `availability` (computed from
  whether any slot has `status: 'AVAILABLE'`) / `url` (the real current page
  URL).
- **`image` deliberately does NOT use the station's own photos.** Checked
  the Prisma schema first: `ChargingStation.images` are base64 data-URLs
  (client-compressed on upload), not hosted URLs a crawler can fetch. Using
  one would both bloat the page and likely fail Google's image requirements
  for structured data. Falls back to the site-level `og-image.png` (a real,
  crawlable file) instead.
- `description` is built from real fields only (name, city, price,
  amenities) — the `ChargingStation` model has no `description` field to
  read, so nothing here is invented.
- Used **`Product`** as explicitly requested. Worth flagging: schema.org also
  has a purpose-built `ElectricVehicleChargingStation` type that's arguably
  more semantically correct for a place/service rather than a purchasable
  good — but `Product` + `Offer` for per-unit pricing (₨/kWh) is a common,
  defensible real-world pattern for exactly this kind of listing (the same
  approach charging-network aggregator sites use to get price rich
  snippets), so I implemented what was asked rather than substituting my
  own preference. Say the word if you'd rather I switch it.

### Review schema — nested inside Product, not standalone
- `aggregateRating` only renders when `reviewCount > 0` (verified: the
  `false && {...}` conditional spread cleanly omits the key entirely when
  there's nothing to report — tested directly, not just assumed. Never fakes
  a rating from zero reviews.
- `reviewStats` (ratingAvg/ratingCount) comes from the backend's
  `ratingStatsFor` helper — a true aggregate across **all** of a station's
  reviews, not just the ones paginated to the page.
- Individual `review` entries are capped at **5**, deliberately not all of
  them. Checked the backend (`getStationReviews`): the API already caps at 20
  by default, and the frontend renders all of those with no further slice —
  so up to 20 could be visible. Embedding all 20 in structured data isn't
  standard practice and would bloat the page; 5 is a representative sample of
  real, genuinely-visible reviews, not fabricated content.

### FAQ schema — skipped, and here's why
Searched the entire frontend (case-insensitive, "faq" and "frequently asked")
before writing anything: **no FAQ section exists anywhere in the app.**
Per your own phrasing ("if FAQ section exists"), I didn't fabricate one —
adding FAQ schema with no matching visible content is exactly the kind of
structured-data/content mismatch Google's spam policies flag. If you want an
actual FAQ section added (e.g. to About or Landing), that's a real content
addition, and I'm happy to build it — then the schema would follow naturally
from real content instead of the other way around.

### Verified
- `npm run build` passes.
- Directly tested (not just assumed) that the conditional-spread pattern used
  for `aggregateRating`/`review` produces clean JSON with the keys fully
  absent when there's no data — not `false`, not empty objects.

## [Unreleased] — Phase 4.1: Meta Tags

### Added
- `frontend/src/components/SEO.jsx` — shared component used by all 26 page
  components (27 files counting `NotFound`), instead of hand-writing the same
  13 tags repeatedly. Verified coverage two ways: a file-count check and a
  cross-check against every page file actually on disk — zero missing.
- `frontend/public/og-image.png` — a real, generated on-brand OG image
  (1200×630, the site's actual cream/gold/dark palette). None existed before;
  left blank or pointed at a placeholder, `og:image` would have been dead.
- `og:url` / canonical resolve against `window.location.origin` at render
  time rather than a hardcoded domain — this app has no permanent deployed
  URL yet, so guessing one would likely be wrong. This way it's automatically
  correct in dev, staging, or wherever it's eventually deployed.

### Fixed in `index.html`
- Stale pre-rebrand `<title>EV Management System</title>` left over from
  before the ChargeEV rename.
- A completely dead Google Fonts load for **Rajdhani** — verified via grep
  that it's referenced by zero CSS or JSX anywhere in the app, just costing a
  network request and FOUT risk for nothing. Removed.
- Added static fallback meta tags (title/description/OG/robots) for crawlers
  that don't execute JS and won't wait for Helmet to mount.

### Per-page indexability — one deliberate deviation from the literal spec
The brief asked for `robots: index, follow` on every page. Applied that only
to the **5 genuinely public** pages (Landing, Stations, Station Detail,
About, Contact). The other **22** — every dashboard, booking, payment,
profile, and all 6 admin pages — get `noindex, nofollow` instead. There's no
search value in indexing a logged-in user's private booking list, and
indexing thin authenticated-app pages is a known way to hurt a site's overall
search-quality signals. Flagging clearly since it's a literal-instruction
deviation, not silently deciding differently.

### Verified
- `npm run build` passes with all 27 files touched.
- `og-image.png` confirmed present in the actual `dist/` build output.
- No dangling `react-helmet-async` imports left in any page (fully migrated).

## [Unreleased] — Phase 3.3: Add Missing CTAs

### Empty states — Stations & Bookings now show a real action
- **Stations** "No stations found": conditional now. If filters are active →
  **"Adjust Filters"** button reusing the existing `handleClear` handler
  (no new logic). If no filters are active (genuinely nothing to show) → no
  fake button — the subtitle already says "check back later," and inventing
  a CTA with nothing useful to do would be worse than none.
- **Bookings** "No bookings found": same pattern. If a status filter is
  active → **"View All Bookings"** (resets the filter). If no filter and
  truly zero bookings → **"Find a Station"** → `/stations`. (Discovered via
  code read: `filter` is a real server-side status filter, so "zero results"
  doesn't always mean "never booked" — the old copy was misleading whenever a
  status tab like "Cancelled" legitimately had nothing in it.)
- Every other `EmptyState` in the app was audited (`AuctionHub` ×3,
  `Payments`, `AdminComplaints`, `AdminLogs`) — deliberately left without an
  action, since none has a meaningful "create" action available (you can't
  manufacture an auction result or an admin log; AuctionHub's "no active
  bids/auctions" states are one click away via a tab that's already visible,
  so a button pointing at it would be redundant).

### 404 — "Go Home" CTA
Already existed, but as one-off inline styling that predated the button
system (no hover, no shadow, no 44px guarantee, raw `#ffffff` instead of a
token). Upgraded to `.btn-primary` + a `Home` icon. **Kept** the existing
context-aware label/destination (Home for guests, Dashboard/Admin Dashboard
for logged-in users) rather than forcing a literal "Go Home" for everyone —
sending an already-authenticated user to the public landing page instead of
their dashboard would be a worse recovery path, not a better one.

### After login → Dashboard CTA
Login already redirected to `/dashboard` (confirmed in `Login.jsx`, no change
needed there). Renamed the Recent-Bookings empty-state button from "Find
Stations" → **"Find Your First Station"** — verified this is accurate, not
just cuter copy: `fetchMyBookings` has no status filter, so
`bookings.length === 0` genuinely means this user has never booked, in every
case. Left the Landing-page and quick-action-tile "Find Stations" instances
alone — those show to every visitor regardless of history, so personalizing
them would be wrong for a returning user.

### After booking → confirmation with CTA
The success toast previously fired with **zero CTA** — just plain text
("Booking confirmed!"), no link anywhere. Enhanced the toast (in
`bookingSlice.js`) to embed a **"View My Bookings"** link, with `autoClose`
extended to 6s so there's time to notice and click it. Implemented with
`createElement`/`Link` rather than JSX syntax, since this file is `.js` (a
Redux slice), not `.jsx` — avoids depending on whether the build's JSX loader
covers `.js` files.

### Verified
- `npm run build` passes with all four changes.

## [Unreleased] — Phase 3.2: Improve CTA Design

Addresses the gaps found in the 3.1 audit. Item-by-item against your list:

### ✅ Dark buttons (visual distinctiveness)
Rule applied: **the sole action in a given context goes dark solid**
(`.btn-primary`); when two actions are paired (e.g. Search + Clear, Login +
Register), the secondary one stays outline. Upgraded to dark: Stations'
**View Details**, StationDetail's **Sign in to book** and **Place Bid**,
AuctionHub's **Place Bid**, Dashboard's empty-state **Find Stations**,
Profile's **Update Password**. Not touched: paired actions that already had
correct primary/secondary contrast (Search/Clear, Login/Register), and
`.btn-danger-sm`/`.btn-success-sm` inline row-actions (a deliberately small,
different UI pattern — inflating "Cancel Bid" to CTA size would look wrong
in a list row).

### ✅ Action-oriented text
Audited every button label app-wide: **zero generic "Submit" buttons exist
already**. Nothing to fix here.

### ✅ Icons on CTAs
Rule applied: arrow icon on CTAs that **navigate to another route**; no icon
on **same-page form-submit** actions (Save Changes, Update Password, Book
Now — a modal, not a nav). Added the missing icon to Dashboard's empty-state
Find Stations. Used `lucide-react` (already the app's icon library, and
functionally the same category as "React Icons") rather than adding
FontAwesome as a second, redundant icon dependency.

### ⚠️ Above the fold — partially applicable, explained
Landing's hero CTAs are already first-screen (Phase 2.3). For the rest,
forcing this isn't good UX: **Book Now** and **Place Bid** are per-slot
actions that only make sense once you can see which slot/price you're
committing to, and **Update Password** can't sensibly sit above its own
current/new/confirm fields. Pushing these above their required content would
orphan the button above empty or unexplained inputs. No layout changes made
here — flagging so this isn't silently ignored.

### ✅ Hover effects
Already implemented in Phase 2.1 (shadow growth + slight lift on both button
classes) and automatically inherited by every CTA above through the shared
classes. Verified, no new work needed.

### ✅ 44px minimum touch target
Added `min-height: 44px` (+ flex-centering so content stays centered
regardless of padding) to **both** shared button classes in one place —
`.btn-gold`/`.btn-primary` and `.btn-outline`/`.btn-outline-gold`. This fixes
every CTA using these classes at once, including the ones that had shrunk
their padding inline (Book Now, Place Bid, Dashboard quick-actions) — no
per-button patches needed. Confirmed safe: the one place `.btn-outline` is
applied directly to an `<a>` (About page contact links) already forced
`inline-flex` inline, so the class-level `inline-block → inline-flex` change
doesn't alter their rendering.

### ✅ Micro-copy — verified-accurate only, not generic filler
Skipped the spec's literal example ("No credit card required") since it's
inaccurate for this app — bookings and bids **do** eventually involve
payment; a blanket "no card" claim would be misleading. Checked the real
backend flow before writing anything:
- `bid.controller.js` has **zero** Stripe/payment calls — a bid is a pure DB
  record. → **AuctionHub "Place Bid": "Charged only if you win."**
- `booking.controller.js` creates the booking (`status: 'CONFIRMED'`) with no
  Stripe call in that path; payment is a separate step. →
  **StationDetail "Book Now": "Reserving your slot doesn't charge your card
  yet."**
- `/stations` has no route guard (confirmed in `App.jsx`, unlike `/register`
  which wraps in `PublicRoute`) → **Landing hero: "Free to browse —
  sign-up only needed to book or list a station."**

Deliberately **not** added to Stations' "View Details" (repeating grid item,
no real friction to reduce — would just be visual noise ×N cards), or to
Save Changes/Update Password (routine settings updates have no natural
anxiety to reassure against). New `.cta-microcopy` utility class in
`index.css` for consistent styling.

### Verified
- `npm run build` passes. Landing's heading order re-checked (still exactly
  one `h1`, h1→h2→h3→h2, no regression from the button/microcopy edits).

## [Unreleased] — Phase 2.3: New Hero Section

`theme-preview.html` now includes a static Hero mockup at the top.

### Changed — `pages/Landing.jsx`
- New headline **"Smart EV Charging, Simplified"** (`h1` — page's only one,
  confirmed no skipped heading levels: h1 → h2 → h3 → h2) and new sub-headline,
  per spec.
- Primary CTA relabeled **"Find Stations"** → `/stations`, using `.btn-primary`
  (dark bg, cream text — already defined in Phase 2.1/2.2). Secondary CTA
  **"List Your Station"** → `/register`, using `.btn-outline`.
- Replaced the old "Verified stations / Nationwide coverage" line with a
  **trust-signal stat bar**: 500+ Stations · 10,000+ Happy Drivers · 4.8★
  Average Rating, divider-separated, fades/slides in last in the stagger.
- Added a **scroll indicator** — a real anchor link (`#features`) with a
  gentle infinite bounce, not just decoration; it actually jumps to the
  Features section (which now has `id="features"`). Respects
  `prefers-reduced-motion` via Framer Motion's `useReducedMotion()` (freezes
  to static instead of bouncing).
- Recolored the existing hand-drawn SVG illustration (EV charging at a
  station) to use **only** the cream/gold/dark palette — it previously had a
  stray blue cable and a gray/blue leaf accent (leftover from the old theme)
  that didn't match the strict 3-color decorative rule. Rewritten to
  canonical tokens (`--bg-primary/secondary/card`, `--text-primary`,
  `--accent-gold*`) instead of the legacy alias names, as a model for future
  new code in this codebase.
- Headline/sub-headline/CTAs/stats/illustration each fade-in + slide-up in a
  staggered sequence (Framer Motion), matching the "subtle" ask — no bounce or
  scale-in flourishes.

### Added — `index.css`
- `.hero-v2` — mobile-first responsive rules inline styles can't express:
  smaller padding and centered/stacked layout under 860px, illustration capped
  at 300px width, scroll indicator hidden once content is stacked (no spare
  vertical room). `.hero-section` kept unchanged (still just the background).

### Note on "loading state" requirement
- Not applicable here: the hero image is an **inline SVG**, not a network
  image, so there's no fetch to mask with a skeleton — one would be pure
  theater with nothing behind it. If you later swap this for an uploaded
  photo, that's exactly where I'd wire a real skeleton tied to the `<img>`'s
  `onLoad` event (the app already has a reusable `Skeleton` component for
  this). Flag it whenever you add a real photo asset.

### Verified
- `npm run build` passes. No dangling imports after removing the old
  `MapPin`/`ShieldCheck` icons (superseded by the stat bar).

## [Unreleased] — Phase 2.2: Update ALL CSS Variables

### Changed
- Restructured `:root` in `index.css` so your exact 24-variable spec (grouped
  as Backgrounds / Text / Accent / Status / Buttons / Cards / Transitions, same
  names, same order) is now the literal top block of the file — easy to
  eyeball against what you pasted.
- Fixed one real mismatch found in the diff: `--transition` was `0.25s`, spec
  says `0.3s` — corrected, and synced in `theme-preview.html` too.
- Everything else in the 24-variable list already matched exactly (confirmed
  by an automated name+value check after the edit).

### Kept, clearly separated and commented
- ~20 legacy variable names (`--primary`, `--border`, `--radius`, `--shadow-sm`,
  `--text-body`, `--danger`, `--gold`, …) that ~40 existing files still
  reference. Each one is now *derived from* the new canonical tokens above (no
  independent colors), in a block explicitly labeled as compatibility aliases.
  **Not deleted** — doing so breaks real things: e.g. `.ev-card`'s
  `border: 1px solid var(--border)` and `.stat-card:hover`'s `var(--shadow-lg)`
  would both silently disappear, since neither name is in the new list and
  nothing else in the codebase has been rewritten to stop using them.
- If you want those legacy names fully purged (not just aliased), that's a
  separate, well-scoped pass: rewrite every call site across ~40 files to the
  new names directly. Flag if you want that done as its own step.

### Verified
- `npm run build` passes after the restructure.

## [Unreleased] — Phase 2.1: Theme & Design Overhaul (cream / dark)

Open `theme-preview.html` in a browser to see the result.

### Changed — design system
- Rewrote the `:root` block in `frontend/src/index.css` to the cream/dark
  palette (cream `#FDF8F0` backgrounds, near-black `#1A1A1A` buttons + navbar,
  minimal `#C9A96E` gold accent, status colors for badges/errors only). The new
  canonical names (`--bg-primary`, `--btn-primary-bg`, `--accent-gold`,
  `--card-shadow`, `--card-radius`, …) and the legacy names the components
  already reference are both defined and mapped to the same values, so the whole
  app re-themes from one block without breaking any `var(--…)` call site.
- **Navbar** is now dark (`#1A1A1A`), sticky, with cream links, a gold active
  indicator + underline, white hamburger, and logged-out CTAs restyled for the
  dark bar (subtle outline + gold solid). Desktop links moved from an inline
  style to a `.navbar-link` CSS class so they get real hover states.
- **Buttons**: primary = near-black solid with a soft shadow that lifts to
  `#333` on hover; secondary/outline = transparent with a dark border that fills
  on hover. Consistent across forms, modals, and CTAs (all use `.btn-*`).
- **Cards**: white, 12px radius, `0 4px 12px rgba(0,0,0,.08)` shadow, 24px
  padding, gold border + deeper shadow on hover (`.ev-card`, `.stat-card`).
- **Typography**: headings 700 near-black; body `#4A4A4A`; unclassed content
  links get a gold underline on hover (scoped so buttons/nav are unaffected).
- Added a `prefers-reduced-motion` guard so hover lifts degrade to color-only.

### Changed — stray colors
- `StationReport` revenue chart recolored from the old navy `#1B3654` to gold.
- `main.jsx` toast border switched from the old green to a neutral themed border.
  (`AdminDashboard`'s chart already used `var(--primary)`, so it auto-themed.)

### Notes / deferred
- **Bootstrap kept in place** for this pass — the color swap runs entirely through
  the CSS variable system and doesn't need the grid removed. Removing Bootstrap
  remains a separate, optional refactor (see 1.2 report).
- Hero redesign (**Phase 2.3**) not included here — it's a larger standalone
  piece and is the natural next step.
- Verified: `npm run build` passes with all theme changes.

## [Unreleased] — Phase 1.3: Environment Configuration

### Added
- `scripts/setup-env.mjs` + `npm run setup:env` (root) — generates local `.env`
  files from the `.env.example` templates. Creates fresh 64-byte random
  `JWT_SECRET` and `ADMIN_SETUP_KEY`, never overwrites an existing `.env`, and
  leaves values it can't know (`DATABASE_URL`, `SENDGRID_API_KEY`, Stripe keys)
  as documented placeholders.
- `/socket.io` entry in the Vite dev proxy with `ws: true`, so real-time
  auction/bid WebSocket traffic is proxied to the backend in development.
- `BACKEND_ORIGIN` override for the dev proxy target (defaults to
  `http://localhost:5000`).

### Changed
- `frontend/src/utils/api.js` and `utils/socket.js` now default to the relative
  `/api` (was an absolute `http://localhost:5000/api`). Dev traffic now flows
  through the Vite proxy — no CORS, no backend URL baked into the bundle.
  Backward compatible: when `VITE_API_URL` is set (as in production), the
  fallback is never used.
- Rewrote `frontend/.env.example` to document the proxy-based dev flow (leave
  `VITE_API_URL` unset locally; set the absolute URL only in production).

### Verified (no change needed)
- Both `.env.example` files are complete: every variable read by the code is
  documented. `DATABASE_URL` is consumed by Prisma via the schema; `DEV` is a
  Vite built-in, not a user-set var.
- Frontend build passes after all proxy/client changes.

### Security note
- The deliverable zip now **excludes the real `.env` files** (only `.env.example`
  ships). Real secrets should never travel in a shared archive — run
  `npm run setup:env` to create local ones. (See also the 1.1 finding: the
  secrets in the originally-uploaded `.env` should be rotated.)

## [Unreleased] — Phase 1.2: Comprehensive Code Audit

Full findings and rationale in `AUDIT_1.2_REPORT.md`.

### Added
- `frontend/src/utils/logger.js` — lightweight client logger that prints in
  development and is silent in production builds; single hook point for future
  remote error tracking (e.g. Sentry).
- `prop-types` dependency, and runtime PropTypes for all 18 reusable
  prop-accepting components across `Skeleton`, `Stars`, `StationsMap`,
  `Spinner`, and `PaymentModal`.

### Changed
- Routed the 4 raw frontend `console.error` calls (`ErrorBoundary`,
  `UserHistory` ×2, `StationReport`) through the new logger.
- `OwnerDashboard` image-upload thumbnails now use a descriptive `alt`
  (`Station photo N`) instead of `alt=""`.

### Verified (no change needed)
- No missing imports — `vite build` compiles the full import graph successfully.
- No dead/commented-out code.
- No unused dependencies. `bootstrap` (grid, imported as CSS) and `prisma`
  (invoked by `postinstall`/`prestart` scripts) are both load-bearing despite
  what a naive scan reports.
- API base already env-driven (`VITE_API_URL` with localhost dev fallback).
- All 71 `.map()` list renders already have stable keys.
- Route-level code splitting already in place.

### Flagged (decisions pending — see report)
- Bootstrap grid is load-bearing; the "no CSS frameworks" rule conflicts with
  the current architecture and needs a decision before Phase 2.
- Leaflet marker icons load from the `unpkg` CDN (optional: self-host).
- `recharts` is the heaviest bundle chunk (already code-split).
