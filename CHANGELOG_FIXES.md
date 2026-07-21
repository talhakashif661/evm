> **Note:** this file is the historical record through the engagement that
> ended with Pass 9 below. Everything from the current engagement (the
> full audit/theme-overhaul/optimization/testing/accessibility/polish work,
> Phases 1–8) is tracked separately in **`CHANGELOG.md`**, so this file's
> own history stays exactly as it was rather than getting mixed with a
> different engagement's entries. If you're looking for something recent
> and don't find it below, check there first.

# Pass 9 — Nodemailer → SendGrid migration + QA pass (2026-07-15)

## Email provider swap: Nodemailer/Gmail SMTP → SendGrid HTTPS API
Render's free tier blocks outbound SMTP ports (25/465/587), so the Gmail-SMTP
transporter would never have worked from a Render deploy. Swapped to
SendGrid, which sends over HTTPS instead.
- `backend/utils/email.js` — `sendEmail()` keeps the exact same signature and
  never-throws/fire-and-forget contract (`{ to, subject, html } -> { success,
  messageId | error }`), so none of its 8 call sites (`auth.controller.js`,
  `booking.controller.js`, `station.controller.js`, `admin.controller.js`,
  `slot.controller.js`, `bookingExpiry.js`, `verification.service.js`) needed
  to change. Internals now call `@sendgrid/mail` instead of building a
  nodemailer transporter. `emailTemplates` (the HTML generators) are
  provider-agnostic and untouched.
- No `SENDGRID_API_KEY` configured -> `sendEmail()` short-circuits with a
  logged warning and `{ success: false }` instead of attempting a send —
  matches the old behavior of a misconfigured transporter failing fast
  without crashing the request it's attached to.
- Env vars: `EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_USER` / `EMAIL_PASS` removed;
  added `SENDGRID_API_KEY`. `EMAIL_FROM` unchanged (still `"Name <email>"`).
  Updated in `.env`, `.env.example`, `README.md`, `SETUP_GUIDE.md`,
  `DEPLOYMENT.md`. `backend/tests/e2e.smoke.test.js`'s email setup simplified
  to match (no more "point SMTP at a dead port" trick — just leaves the key
  unset).
- `package.json`: removed `nodemailer`, added `@sendgrid/mail`. Installed and
  verified with `npm install`/`npm uninstall` — 0 vulnerabilities.
- **Manual step still needed (real API key not available in this pass):**
  paste a real `SENDGRID_API_KEY` into `backend/.env` and Render's env vars,
  and verify `EMAIL_FROM`'s address under SendGrid Settings → Sender
  Authentication — an unverified sender fails every send with a 403 even
  with a valid key.

## QA pass findings (fixed)
- `backend/services/verification.service.js` — the OTP email template was
  still on the old dark/gold palette; Pass 8's rebrand ("All 26 old dark/gold
  color codes in the email templates... verified zero leftovers") only
  covered `utils/email.js`'s templates and missed this one. Now matches the
  same light/green palette.
- `backend/middleware/error.middleware.js` — used a raw `console.error`
  instead of the `logger` utility every other file in the codebase goes
  through, losing the `[ERROR]`/timestamp prefix. Switched to `logger.error`.

## QA pass findings (flagged, not auto-fixed — see chat)
- `backend/.env` has real credentials (MongoDB Atlas password,
  `ADMIN_SETUP_KEY`) that a prior pass's note says were already exposed to
  an earlier audit read of this file. The Gmail App Password that was also
  flagged is now moot (removed as part of this migration) but should still
  be revoked from the Google account since it's no longer used anywhere.
  Rotating the Atlas password and `ADMIN_SETUP_KEY` is a credential-rotation
  action with external side effects, so it wasn't done automatically here.

---

# Pass 8 — Station Ratings & Reviews + full dead-path cleanup (2026-07-05)

## New feature: Station Ratings & Reviews (verified purchase only)
- `Review` model in `schema.prisma` (1-5 stars + optional comment, one review
  per user per station via `@@unique([userId, stationId])`; auto-synced by the
  `npm start` prestart hook).
- `POST /api/reviews` — EV users only, gated by a **verified-purchase rule**:
  you must have at least one COMPLETED **and paid** session at that station
  (checked in one query through the payment -> booking -> slot chain).
  Posting again UPDATES your existing review.
- `GET /api/reviews/station/:id` — public: latest reviews + { ratingAvg,
  ratingCount } stats. `DELETE /api/reviews/:id` — author removes their own;
  ADMIN can moderate any (audited as `REVIEW_DELETED`).
- Station list + detail endpoints now carry `ratingAvg` / `ratingCount`
  (one extra query for the whole page, no N+1).
- Frontend: new `components/Stars.jsx` (fractional star display + star
  picker). Stars appear on **station cards**, **map popups**, and the
  **station detail header**; the detail page gains a full Reviews section
  (reviewer avatar/name, stars, date, comment, delete-own) and a
  write/edit modal. Audit Log shows a "Review Moderated" badge.
- **7 new E2E tests** (owner blocked by role, no-purchase 403, post 201 with
  stats, upsert-not-duplicate, bad rating 400, public read + decorated
  cards/detail, author-only + audited admin deletion). **Suite: 63/63.**

## Dead paths — every one from the audit, fixed

### The big one (found while fixing): payments were UI-dead
The owner dashboard's "Complete" button only rendered for bookings with
status `ACTIVE` — which **no code path ever sets** — so owners could never
complete a session from the UI, users could never reach "Pay Now", and the
entire payment flow only worked via API tests. Button now shows for
`CONFIRMED` sessions. (`OwnerDashboard.jsx`)

### Orphaned endpoints -> given a UI
- `PUT /stations/owner/mine` -> new **Edit** button + modal on the owner
  dashboard (name, address, city, coordinates, price). Edits keep APPROVED
  status — no re-approval loop.
- `DELETE /slots/:id` -> **Delete** button per slot (confirm dialog; the
  backend's live-booking guard already refuses unsafe deletions with a 409).

### Orphaned endpoints -> removed
- `GET /api/ai/route` (+ its 50-line controller) — route-planner feature was
  declined, so the dead code is gone.
- `GET /api/bookings/:id`, `GET /api/evs/:id` — never called by anything.
- `GET /api/users/profile` — exact duplicate of `GET /api/auth/me`.

### Dead enum/UI paths
- Admin dashboard "active" stat counted status `ACTIVE` (permanently 0);
  now counts bookings whose reserved window covers **right now** — a real
  "charging now" number.
- Bookings page: removed the `PENDING` and `ACTIVE` filter chips that could
  never match anything.
- `INACTIVE` removed from the admin stations query whitelist (never set).
- Removed unused `.hero-blob` CSS class.

### Misleading navigation
- `/stations` and `/stations/:id` are now **public** (the APIs always were);
  logged-out visitors browse stations and see reviews, and each slot shows a
  "Sign in to book" button instead of silently bouncing to login. Bonus fix:
  the detail page now fetches your EVs on load, so booking directly from a
  shared link works.
- The three owner navbar links that opened the same page are now one
  ("My Station"); the old `/owner/slots` and `/owner/bookings` URLs redirect.

### Placeholder links + stale branding
- Footer social icons (`#` dead links) replaced with real WhatsApp / Email /
  Call buttons using the developer contact info.
- All 26 old dark/gold color codes in the email templates rebranded to the
  current light/green identity (verified zero leftovers).

---

# Pass 7 — Complaints system, Contact & About pages, real footer (2026-07-05)

## New: full complaint pipeline (Contact Us → Admin inbox)
- **`Complaint` model** in `schema.prisma` (name, email, optional phone,
  subject, message, optional account id; contact details stored inline so
  the admin can always reply). Auto-synced on `npm start` via the prestart
  db push — nothing to run manually.
- **`POST /api/complaints`** — PUBLIC: guests and logged-in users can both
  complain. If a valid token is present the account id is recorded (the
  controller does a lightweight token peek instead of requiring auth).
  Validated (name/email/subject/message lengths) and spam-limited
  (5 per hour per device on top of the general API limiter).
- **`GET /api/complaints`** + **`DELETE /api/complaints/:id`** — ADMIN only,
  paginated, newest first. Deletions are written to the audit log as
  `COMPLAINT_DELETED`.
- **Admin → Complaints** page (`/admin/complaints`, "Inbox" sidebar entry):
  card list with subject, timestamp, complainer identity (guest-flagged),
  full message, and per-complaint actions —
  **Reply on WhatsApp** (pre-filled `wa.me` message, shown when a phone was
  given), **Reply by Gmail** (`mailto:` with `Re:` subject), and **Delete**
  (with confirm). Skeletons, empty state, pagination.
- **Contact page** (`/contact`, public): complaint form (pre-filled from the
  logged-in profile) + a direct-contact card (call / WhatsApp / Gmail /
  location).
- **6 new E2E tests** (guest submit, logged-in id capture, validation
  rejection, admin-only inbox + ordering + phone passthrough, audited
  delete). **Suite total: 56/56 passing.**

## New: About page (`/about`)
Project overview (booking, AI recommendations, auctions, verification/audit)
plus a developer card — Talha Kashif, Final Year Project, Punjab University —
with Call / WhatsApp / Email buttons.

## Footer overhaul
- Dead `#privacy/#terms/#contact` links replaced with a **Company** column
  (About Us, Contact Us — real routes).
- "Support" blurb replaced with **Get in Touch**: Punjab University, Lahore ·
  +92 316 8804471 (tap-to-call) · talhakashif131@gmail.com (mailto).
- Credit line: "Developed by Talha Kashif — Punjab University".
- Navbar (logged-out) now also shows About and Contact.
- Contact details live in one place: `src/utils/contactInfo.js`.

---

# Pass 6 — Feature build + full-site audit (2026-07-05)

Everything below was verified by a NEW end-to-end test suite (51/51 passing)
that runs the real Express app against an in-memory database — plus a clean
frontend production build and a live boot of both servers.

## REQUIRED on your machine after pulling this version
```
cd backend
npx prisma generate
npx prisma db push        # the Booking model gained a new field (plannedEndTime)
```

## New features

### 1. Payment History page (/payments)
The backend endpoint GET /api/payments/history existed but no page ever called
it. Now: frontend/src/pages/Payments.jsx (table with station, slot, method,
status badges, Total Paid card, skeleton loading, empty state, PKR formatting),
fetchPayments thunk in bookingSlice.js, route + page title in App.jsx, and a
"Payments" link in the user navbar.

### 2. Admin Audit Log (/admin/logs)
The Log model existed in the schema since day one but nothing wrote to it.
Now every sensitive admin action leaves a trail:
- backend/utils/audit.js — fire-and-forget writer (an audit failure can never
  break the action it describes).
- Wired into: block/unblock user, delete user, promote to admin,
  approve/reject station, and the one-time admin bootstrap (ADMIN_BOOTSTRAPPED).
- GET /api/admin/logs — paginated, actor names batch-resolved.
- New admin page AdminLogs.jsx with per-action icons/colors + pagination,
  sidebar entry "Audit Log", route, and adminLogsSlice.

### 3. Time-window bookings with overlap detection
Bookings are now scheduled windows instead of an open-ended lock on the slot:
- schema.prisma: Booking.plannedEndTime DateTime? (null = open-ended, used by
  auction wins and pre-existing bookings).
- createBooking rewritten (booking.controller.js):
  - durationMinutes (optional, default 60, validated 15-1440) computes the
    planned end; start times in the past are rejected (10-minute grace).
  - Interval-overlap conflict check — the 409 tells the user exactly WHEN the
    slot is taken so they can pick a different window.
  - Multiple users can book the SAME slot for different, non-overlapping
    windows; a RESERVED slot (busy right now) accepts future windows.
    Only MAINTENANCE/OCCUPIED block outright.
  - Race safety on MongoDB without transactions: optimistic insert, then
    re-query contenders — deterministic winner (smallest ObjectId), loser
    deletes its own row and gets a 409.
  - syncSlotStatus() helper recomputes AVAILABLE/RESERVED from whether a live
    window covers "now" (never touches owner-set OCCUPIED/MAINTENANCE); used
    by create/cancel/complete instead of blind status flips.
  - Final cost is still computed at completion from ACTUAL elapsed time — the
    planned window is a schedule, not a bill.
- Frontend: duration picker (30 min - 4 h) with a live estimated-cost preview
  in the booking modal; Bookings page shows the start -> planned-end window.

## Fixes found during the deep audit

4. closeAuction returned a stale winner status — the bid was updated to WON in
   the DB, but the HTTP response still said PENDING (slot.controller.js).
   Caught by the new E2E suite.
5. Favicon was a 404 — index.html referenced /ev-icon.svg but there was no
   public/ folder. Created frontend/public/ev-icon.svg.
6. Hero CTA mismatch — "Browse Stations" linked to /register; now /stations.
7. WCAG contrast failures (measured, not guessed) in index.css:
   - --text-muted #8AA093 -> #63776B (2.8:1 -> 4.8:1) — table headers, hints,
     timestamps.
   - --accent / --info #0EA5E9 -> #0369A1 (2.8:1 -> 5.9:1 as text).
   - --warning #D97706 -> #B45309 (3.2:1 -> 5.0:1; 4.5:1 on the amber banner).
   Same hue families — the design language is unchanged, just readable.

## New test infrastructure

8. tests/helpers/inMemoryPrisma.js — a dependency-free in-memory Prisma
   stand-in (findUnique/findFirst/findMany/create/update/updateMany/delete/
   count/aggregate/$transaction, where-operators, relations, select/include,
   _count, unique constraints with P2002). Tests only — production still uses
   the real client.
9. tests/e2e.smoke.test.js — 35 end-to-end tests through the REAL app with no
   DATABASE_URL: admin bootstrap (wrong key / right key / second attempt),
   registration + login for all three roles, the login-response leak
   regression, role guards + KYC gate, station approval lifecycle, window
   bookings incl. overlap 409 + non-overlap 201, server-side cost math
   (2 h x 22 kW x $0.18 = $7.92), pay-exactly-once, payment history chain,
   auction (owner-bid block, priority formula, close -> WON + booking,
   late-bid rejection), dashboard aggregates, audit-log contents, blocked-user
   lockout. Suite total: 51/51 passing.

## Verified-working (audited, no change needed)
- Map: leaflet/dist/leaflet.css imported, CDN marker-icon fix, auto-fit
  bounds, Pakistan default center, PKR in popups.
- Fonts (Rajdhani + Inter) via Google Fonts; viewport meta; SEO/OG tags on the
  landing page; lazy-loaded routes; error boundary; 404 page.
- Navbar (role-aware links, avatar, mobile menu, verify banner), Footer, Hero,
  Login/Register (role selector), admin auto-redirect after login.
- Body/secondary text contrast was already excellent (15-16:1 / 6:1).

## Known cosmetic leftovers (intentionally untouched)
- Email templates still use the old dark/gold branding.
- Footer "Legal" and social links are placeholders (#).

---

# Changelog — First Real Build/Test Run + Security & Correctness Fixes (latest pass)

This pass was the first with network access, so for the first time the project
was actually **installed, built, and test-run** — not just statically checked.

## Validation performed (previously never done)
- `npm install` in **both** `backend/` and `frontend/` — dependencies resolve cleanly.
- `npm test` (backend) — **all tests pass** (Jest + Supertest, DB-free validation/auth-guard suite).
- `npm run build` (frontend) — **Vite production build succeeds** with no errors.
- Note: Prisma's engine binary host is firewalled in the build sandbox, so
  `prisma generate` can't fetch the query engine here; a throwaway stand-in
  client was used only to let the DB-free test suite's module graph load. On a
  normal machine / Render, `prisma generate` runs for real — nothing in the app
  code needs changing.

## Real bugs fixed this pass
- **[SECURITY] `auth.controller.js` — `login` leaked internal hashes.** The login
  handler fetched the whole `User` row and stripped only `password`, so the
  response (and therefore `localStorage`) also contained `verificationOtpHash`
  and `resetTokenHash`. The OTP hash is an **unsalted SHA-256 of a 6-digit code**
  (~900k possibilities), i.e. brute-forceable offline. Fixed by selecting only
  safe fields in the login query.
- **[RACE] `booking.controller.js` — double-booking.** The conflict check was a
  read-then-write (`findFirst` then `create`), so two simultaneous requests
  could both pass and both book the same slot. Replaced with an **atomic
  conditional claim** (`updateMany` flipping the slot `AVAILABLE -> RESERVED`
  only if still available); the losing request now gets a clean 409. Slot is
  rolled back if the booking row fails to create.
- **[LOGIC] `bid.controller.js` — owner could bid on their own slot.** `placeBid`
  never checked slot ownership. Now loads the station owner and rejects a
  station owner bidding on their own auction (403).
- **[DATA] `ev.controller.js` — `addEV` could write `NaN`.** The `NaN`-guard added
  earlier to `updateEV`/`updateBatteryLevel` was never applied to the create
  path, so `parseFloat("abc")` on `batteryCapacity` could still persist `NaN`.
  Now validates the parsed numbers.
- **[CONSISTENCY] Frontend — 9 hardcoded `* 280` PKR conversions bypassed `toPKR()`**
  in `StationDetail.jsx`, `AuctionHub.jsx`, `AdminStations.jsx`, and
  `OwnerDashboard.jsx`. These ignored the configurable `VITE_PKR_RATE` and used
  inconsistent formatting. All replaced with `toPKR()` (imports added where
  missing). The project rule "PKR via `toPKR()` everywhere" now actually holds.

## Tests added
- `tests/priority.scoring.test.js` — pure-function tests pinning the auction
  priority formula (60% normalized bid + 40% battery urgency, critical-battery
  boost, ceiling clamp) and **proving rankings are order-independent** (the
  fixed-ceiling normalization property). DB-free; runs anywhere.

---

# Changelog — Bug Hunt: EV Battery Validation, AI Routing, Admin Chart, Payments (previous pass)

Full audit pass through every backend controller not previously reviewed line-by-line.

## Real bugs fixed
- **`ev.controller.js` — `updateEV`**: a non-numeric `batteryPercentage`/`batteryCapacity` (e.g. `"abc"`) passed the old `!== undefined` check and `parseFloat()` silently wrote `NaN` into MongoDB. Now validates the parsed number before saving.
- **`ev.controller.js` — `updateBatteryLevel`**: same root cause — `"abc" < 0` and `"abc" > 100` both evaluate to `false` in JS (NaN comparisons are always false), so garbage input slipped past validation and got written as `NaN`. Now parses first, then validates.
- **`ai.controller.js` — `getOptimalRoute`**: unlike `getRecommendations`, this endpoint never validated `latitude`/`longitude`. Missing/invalid coordinates became `NaN`, every distance check against `NaN` is `false`, so it silently returned an empty `reachable: []` with a `200` instead of a clear `400` — looked like "no stations in range" when it was actually a missing-parameter error.
- **`admin.controller.js` — `getDashboardStats`**: the monthly chart data built 6 months of labels but never actually queried booking counts — every month always showed nothing. Now aggregates real per-month booking counts.

## Features that existed on the backend but were never connected to any UI
- **Admin dashboard chart + recent activity**: the backend already returned `chartData` and `recentBookings`, and the Redux slice already stored them — `AdminDashboard.jsx` just never rendered either. Added a Recharts monthly-bookings bar chart and a recent-activity feed (Recharts was already an installed, unused-here dependency).
- **Payments**: `POST /api/payments/pay/:bookingId` and `GET /api/payments/history` were fully implemented and working, but nothing in the frontend ever called them — a completed booking showed a cost with no way to actually pay it. Added a "Pay Now" button / "Paid" badge to `Bookings.jsx`, backed by a new `payBooking` thunk.

---

## Previous pass — Forgot Password, Admin Promotion, Maps, Real-time, Validation, Tests

Follow-up pass covering everything suggested after the theme overhaul.

## Another real bug found (routing)
- **`/stations/:id` route was never registered in `App.jsx`.** `Stations.jsx` linked to it and `StationDetail.jsx` existed and worked fine, but clicking "View Details" on any station 404'd. Fixed by registering the route.

## Forgot / Reset Password
- `POST /api/auth/forgot-password` + `POST /api/auth/reset-password` (`auth.controller.js`) — SHA-256-hashed, 30-minute-expiry tokens stored on the `User` row (`resetTokenHash`, `resetTokenExpiry` in `schema.prisma`), emailed via the existing Nodemailer setup. Always responds with the same generic message on request so it can't be used to enumerate accounts. Own rate limiter (3 req/15min).
- New pages: `ForgotPassword.jsx`, `ResetPassword.jsx` (reads `?token=&email=` from the emailed link), linked from `Login.jsx`.

## Second (and further) admins
- `PATCH /api/admin/users/:id/promote` (`admin.controller.js`) — lets an existing admin promote any user to `ADMIN`. This is now the *only* path to a second admin, since `setup-admin` only ever works once. Wired into `AdminUsers.jsx` with a confirm dialog.

## Map view
- `StationsMap.jsx` — `react-leaflet` + OpenStreetMap tiles (free, no API key), auto-fits bounds to the visible stations, popups link to station detail. Toggle button (List/Map) added to `Stations.jsx`.

## SEO
- `react-helmet-async` added (`main.jsx` wraps the app in `HelmetProvider`); `Landing.jsx` and `Stations.jsx` now set title + meta description/OG tags. Other routes keep the lightweight `document.title`-only approach from the previous pass.

## Real-time auction/bid updates (Socket.IO)
- `backend/utils/socket.js` — shared `Server` instance, room-based (`slot:<id>`, `station:<id>`).
- `server.js` now creates a raw `http.Server` and attaches Socket.IO to it (Express behavior unchanged). **Note:** `server.js` was split into `app.js` (the Express app, safe to import with no side effects) + a thin `server.js` bootstrap — this was needed to make the backend testable (see below) and is a better structure regardless.
- `bid.controller.js` emits `bid:update`/`bid:new` on every new/updated bid; `slot.controller.js` emits `auction:opened`/`auction:closed`.
- Frontend `utils/socket.js` (shared client), wired into `AuctionHub.jsx` (live-refreshes on bid/auction activity, toasts when a watched auction closes) and `OwnerDashboard.jsx` (toasts the owner the instant a bid lands on their slot).

## Input validation
- `express-validator` was already an unused dependency — now actually used. `middleware/validate.js` + `validators/authValidators.js` + `validators/bookingValidators.js`, applied to register/login/forgot-password/reset-password/booking-creation/bid-placement. Consistent `400 { success:false, message, errors:[...] }` responses instead of scattered manual `if` checks.

## Tests
- `backend/tests/` — Jest + Supertest, DB-free validation and auth-guard tests (`npm test` in `backend/`). See `backend/tests/README.md` for scope and how to extend with DB-backed integration tests — those need a real reachable `DATABASE_URL`, which this environment doesn't have.

## Skeleton loaders extended
- Added to `Dashboard.jsx` (stats, My EVs, Recent Bookings, station-owner stats), `Bookings.jsx`, `UserHistory.jsx` (stats + table rows). `Profile.jsx` was checked and skipped on purpose — it reads already-loaded Redux state with no async fetch of its own, so there's no loading gap to skeleton.
- `.ev-table` usages were checked across all 6 files that use it — all already wrapped in `overflowX: 'auto'`, so no change was needed there.

## Theme consistency pass
- `AuctionHub.jsx`'s explanation banner still had an old dark-brown gradient from before the light-theme rewrite; updated to the current primary/accent glow variables.

## Still not done, and why
- **Full DB-backed integration tests** — need a real `DATABASE_URL`; not available in this environment.
- **Avatar storage on Cloudinary/S3** — explicitly flagged as "not urgent now"; base64-in-Mongo is fine at current scale.

---

## Previous pass — UI/Theme Overhaul, Admin Bootstrap, Profile Avatars

This pass fixes the 4 bugs from the last audit (plus one more found along the
way), adds a Postman-driven admin bootstrap flow, adds profile pictures with
50KB compression, and replaces the entire dark theme with a light, EV-branded
theme + new layout (navbar, footer, hero, marquee).

## 1. Bugs fixed
- **`--brown` / `--gold-dark` undefined CSS vars** — both now defined for real in the new `:root` (`index.css`), so the Profile avatar gradient and the AI Recommend score bars render correctly.
- **`.btn-outline-gold` class was never defined anywhere** (found during this pass, not in the original audit) — used across 8 files, was silently rendering as an unstyled plain button. Now defined in `index.css`.
- **Profile save didn't update Redux** — `Profile.jsx` now dispatches the new `updateUser` action (`authSlice.js`) with the API's response, so the navbar/greeting update immediately, no refresh/re-login needed.
- **Register's fragile name split/join** — `Register.jsx` now keeps `firstName`/`lastName` as separate state for the whole form and joins them once, only on submit.

## 2. First-time admin creation via Postman (persists in MongoDB)
- `POST /api/auth/setup-admin` (new, `auth.controller.js` + `auth.routes.js`) — key-protected via `ADMIN_SETUP_KEY` env var, refuses to run if any admin already exists. Creates a normal `User` row with `role: ADMIN` that persists in MongoDB across logout/restart like any other account. See README § "Creating the First Admin (via Postman)".
- `prisma/seed.js` no longer auto-creates a demo admin — admins are only ever created via the endpoint above or promoted by an existing admin.

## 3. Profile pictures (<50KB, MongoDB-friendly)
- `prisma/schema.prisma` — added `avatar String?` to `User`.
- `routes/user.routes.js` — `PUT /api/users/profile` accepts a base64 `avatar` data URL, rejects (413) anything decoding to over 50KB, and allows clearing it.
- `pages/Profile.jsx` — new avatar upload UI: picks a file, resizes/re-compresses it client-side (canvas + JPEG quality/size step-down loop) until it's under 50KB, then uploads. Falls back to initials when no avatar is set. Shown in the Navbar and Admin sidebar too.

## 4. Full light theme + layout overhaul
- `index.css` — entire dark palette replaced with a light, green/blue EV-brand palette (see README/CSS comments for the variable list). All existing component classes (`btn-gold`, `ev-card`, `badge-*`, admin sidebar, etc.) re-themed automatically since they all route through the same variables.
- New components: `Navbar.jsx` (responsive, animated hamburger menu, active-link indicator, sticky), `Footer.jsx`, `Marquee.jsx` (scrolling announcement bar, pauses on hover), `BackToTop.jsx`, `Skeleton.jsx` (shimmer loaders, used on the Stations list).
- `Landing.jsx` — full hero rewrite (headline, CTAs, hand-drawn inline SVG illustration so there's no dependency on an external image host), feature cards, CTA section.
- `App.jsx` — wraps every non-admin route in Marquee + Navbar + Footer + a floating Back-to-Top button, adds a framer-motion fade/slide page transition, and sets `document.title` per route.
- Assorted hardcoded dark-theme literals (`#080C10`, `#0a0a0a`, `#00D4AA`, etc.) scattered across `NotFound.jsx`, `ErrorBoundary.jsx`, `VerifyEmail.jsx`, `Stations.jsx`, `Bookings.jsx`, `UserHistory.jsx`, `StationReport.jsx`, `main.jsx` updated to match the new palette / fixed contrast (white-on-white text bugs, etc.).

## Not included in this pass
No new npm dependencies were added (no `react-leaflet` map view, no `react-helmet-async`) because this environment has no network access to install/verify new packages against your lockfile. Everything above uses only what was already in `package.json` (React, Redux Toolkit, `framer-motion`, `lucide-react`, Bootstrap grid, `react-router-dom`, `react-toastify`). If you want the map view or richer SEO tags, they can be added in a follow-up with `npm install react-leaflet leaflet react-helmet-async`.

---

## Previous pass — Bug Fixes & KYC Verification

This pass covers the **5 critical bug fixes**, **security hardening**, and a **full email OTP verification (KYC) system**, end to end. Tests, the React-Icons emoji sweep, and the deployment/viva docs were intentionally left out of this pass — see "Not included" at the bottom.

## 1. Bug fixes
- `backend/controllers/slot.controller.js` — `closeAuction` no longer falls back to writing a User ID into a Booking's `evId`. If the auction winner has no EV on file, the bid is still marked `WON`, the slot is reopened, and the response clearly says no booking was created.
- `backend/middleware/validateQuery.js` (new) — whitelists/validates query params before they reach Prisma `where` clauses. Applied to `GET /api/admin/users` and `GET /api/admin/stations`.
- `backend/controllers/station.controller.js` — `createStation` now uses explicit `undefined`/`null`/`''` checks instead of `!value`, so `latitude: 0`, `longitude: 0`, and `pricePerKwh: 0` are accepted. Also validates numeric ranges and rejects `NaN`.
- `backend/controllers/bid.controller.js` — `calculatePriority` now normalizes against a fixed reference ceiling (`REFERENCE_MAX_BID = 100`) instead of the highest bid seen so far, so scores are stable and comparable regardless of bid order.
- `backend/utils/email.js` — `sendEmail` now always resolves (never rejects) and logs through the new `backend/utils/logger.js`, eliminating the unhandled-rejection risk on fire-and-forget calls in `auth.controller.js`/`booking.controller.js`.

## 2. Security hardening (`backend/server.js`)
- `helmet()` added (CSP relaxed in dev for Vite HMR, tightened in production).
- Dedicated rate limiters: login (5/15min), register (10/hour), send-otp (3/15min), verify-otp (5/15min), resend-otp (2/30min), on top of the existing general 200/15min limiter.

## 3. KYC email verification (new)
**Backend:**
- `prisma/schema.prisma` — added OTP fields to `User` (`verificationOtpHash`, `verificationOtpExpiry`, `verifiedAt`, `verificationAttempts`, `lastVerificationAttempt`, `verificationBlockedUntil`, `lastOtpSentAt`). `isVerified` already existed.
- `services/verification.service.js` — OTP generation (`crypto.randomInt`), SHA-256 hashing before storage, expiry (10 min default), attempt tracking, 1-hour block after 3 failed attempts, 60s resend cooldown.
- `controllers/verification.controller.js` + `routes/verification.routes.js` — `POST /api/auth/send-otp`, `POST /api/auth/verify-otp`, `POST /api/auth/resend-otp`, `GET /api/auth/verification-status`, all behind `authenticate`.
- `middleware/kyc.middleware.js` — `requireVerified()`, applied to `POST /api/stations`, `POST /api/bids`, `POST /api/bookings`. Admins are exempt.
- `controllers/auth.controller.js` — `register` now fires an OTP email automatically (non-blocking); `login` still succeeds for unverified users but the response message nudges them to verify.

**Frontend:**
- `pages/VerifyEmail.jsx` — 6-digit OTP input with auto-focus/paste support, resend cooldown timer, redirects to `/dashboard` on success.
- `components/VerificationBanner.jsx` — dismissible banner shown to unverified users, links to `/verify-email`.
- `store/slices/verificationSlice.js` — wired into `store/index.js`.
- `utils/api.js` — added `sendVerificationOTP`, `verifyOTP`, `resendOTP`, `getVerificationStatus`.
- `App.jsx` — new `/verify-email` route; banner renders globally when logged in.

## Required env vars (add to `backend/.env`)
```
OTP_EXPIRY_MINUTES=10
MAX_VERIFICATION_ATTEMPTS=3
VERIFICATION_BLOCK_HOURS=1
RESEND_COOLDOWN_SECONDS=60
```
(Reuses the existing `EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_USER` / `EMAIL_PASS` / `EMAIL_FROM` vars already in `.env.example` — for Gmail, generate an App Password under Google Account → Security → App Passwords after enabling 2FA.)

## Running locally
```bash
cd backend
npm install
npx prisma generate
npx prisma db push        # syncs the new User fields to MongoDB (no migration system needed for Mongo)
npm run dev                # or: node server.js

cd ../frontend
npm install
npm run dev

```

## Deploying to Vercel
- The `backend` is a long-running Express server, not serverless functions — Vercel can host it via the Node.js runtime, but Render/Railway are a more natural fit for an always-on Express + MongoDB app. If you do want Vercel for the backend, set the build to use `@vercel/node` and confirm `DATABASE_URL`/SMTP secrets are added in the Vercel project's Environment Variables.
- `frontend` (which now includes Admin at `/admin/*`) deploys cleanly to Vercel as a static Vite build. Set `VITE_API_URL` in the project's Vercel environment to your deployed backend URL, and set `CLIENT_URL` on the backend to the deployed frontend URL (CORS depends on this).

## 4. Admin merge (this pass)
- Deleted the standalone `admin-panel/` app. It was a stale duplicate: `frontend/src/pages/admin/*` and the `admin*` store slices already existed and were wired into `App.jsx`/`store/index.js`, but the admin-only sidebar shell (`AdminLayout`) had never been migrated over, so `/admin/*` pages rendered without navigation and stacked underneath the public `Navbar`.
- Added `frontend/src/components/AdminLayout.jsx` (ported from `admin-panel`, links repointed to `/admin/...`, colors mapped to the frontend's teal theme instead of the old gold theme) and nested the four admin routes under it in `App.jsx` using React Router's nested-route pattern (`<Route path="/admin" element={<AdminLayout/>}>`).
- `App.jsx` now hides the public `Navbar` on `/admin/*` routes so the admin sidebar doesn't double up with it.
- Added the missing `.admin-layout` / `.admin-sidebar` / `.admin-main` / `.admin-content` / `.admin-topbar` / `.sidebar-link` CSS rules to `frontend/src/index.css`.
- Replaced `<a href>` admin quick-action links with React Router `<Link>` to avoid full page reloads.
- `frontend/package.json` gained a `start` script (alias for `vite`) to match `backend`'s `npm start` convention.
- Removed the now-dead `ADMIN_URL` env var and its CORS/CSP references in `backend/server.js` and `backend/.env.example`, since admin traffic now originates from the same origin as `CLIENT_URL`.

## Not included in this pass
- Automated test suite (Jest/Vitest) for `calculatePriority`, `calculateStationScore`, auth — still recommended before submission, happy to add next.
- `express-validator` schema layer (`backend/validators/*`) — current ad-hoc validation was tightened where it mattered (station, bid) but not fully replaced.
- Emoji → react-icons sweep across ~28 frontend files — separate, mechanical pass; let me know if you want it next.
- `DEPLOYMENT.md` / `VIVA_PREPARATION.md` / `FINAL_CHECKLIST.md` — can generate these quickly on request.
