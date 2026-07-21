# ChargeEV API Reference

Base URL (local): `http://localhost:5000/api`. All request/response bodies
are JSON unless noted. Every response follows `{ success: boolean, data?,
message?, errors? }`.

**Auth**: Bearer JWT in `Authorization: Bearer <token>`, obtained from
`/auth/login` or `/auth/register`. No cookies are involved anywhere in this
API — see `README.md`'s Security section for why that matters for CSRF.
Routes marked 🔒 require a valid token; 🔒**Role** additionally requires
that role; 🔒**Verified** additionally requires a verified email (KYC gate).

This file is the exhaustive reference. `README.md`'s own "Key API
Endpoints" section is a shorter, curated overview — if the two ever
disagree, this file is the one kept in sync with the actual route files.

---

## Authentication (`/auth`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/auth/register` | — | Body: `{ name, email, password, role, phone? }`. `role` is `EV_USER` or `STATION_OWNER` — `ADMIN` is rejected here by design. |
| POST | `/auth/setup-admin` | Header `x-setup-key` | Bootstraps the **first** admin only — refuses with `409` once any admin exists. Rate-limited (5/15min). Postman-only by design, no frontend UI calls it. |
| POST | `/auth/login` | — | Rate-limited (5/15min). |
| POST | `/auth/forgot-password` | — | Rate-limited (3/15min). Always returns success regardless of whether the email exists, to avoid leaking which emails are registered. |
| POST | `/auth/reset-password` | — | Body: `{ email, token, newPassword }`. Reset tokens are SHA-256 hashed at rest and expire after 30 minutes. |
| POST | `/auth/logout` | 🔒 | Revokes the token server-side immediately — it stops working even though its signature is still cryptographically valid. |
| GET | `/auth/me` | 🔒 | Returns the current user, including profile fields — this is what the frontend actually calls, not a separate profile-fetch endpoint. |
| PUT | `/auth/change-password` | 🔒 | Body: `{ currentPassword, newPassword }`. |

## Email Verification / OTP (`/verification`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/verification/send-otp` | 🔒 | Rate-limited. |
| POST | `/verification/verify-otp` | 🔒 | Rate-limited separately from send. |
| POST | `/verification/resend-otp` | 🔒 | Shares the send limiter. |
| GET | `/verification/verification-status` | 🔒 | |

Verification is a hard gate, not optional — `requireVerified()` blocks
booking creation and bid placement until it's done (see Phase 7.1's test
plan for what's live-tested here vs. code-verified).

## Profile (`/users`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| PUT | `/users/profile` | 🔒 | Body: `{ name?, phone?, avatar? }`. `avatar` is a base64 image data URL, capped at 50KB and verified by actual magic bytes (JPEG/PNG/WebP), not just a claimed MIME prefix — see Phase 7.2. |

## EV Management (`/evs`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/evs` | 🔒 | The caller's own EVs only. |
| POST | `/evs` | 🔒 | |
| PUT | `/evs/:id` | 🔒 | |
| DELETE | `/evs/:id` | 🔒 | |
| PATCH | `/evs/:id/battery` | 🔒 | Body: `{ batteryPercentage }`. |

## Stations (`/stations`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/stations` | — | Public. Query: `city, name, maxPrice, minRating, page, limit`. Cached in-memory for 30s per exact query (see Phase 6.2) — invalidated immediately on edit/approval, not left to expire. Returns only `images[0]` per station, not the full gallery. |
| GET | `/stations/:id` | — | Public. Full detail including the complete photo gallery. |
| POST | `/stations` | 🔒**Owner, Verified** | Starts as `PENDING` — needs admin approval before it's public. |
| GET | `/stations/owner/mine` | 🔒**Owner** | |
| PUT | `/stations/owner/mine` | 🔒**Owner** | Editing a `REJECTED` station resubmits it for approval automatically. |
| GET | `/stations/owner/bookings` | 🔒**Owner** | |
| GET | `/stations/owner/revenue` | 🔒**Owner** | |

## Slots (`/slots`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/slots/station/:stationId` | — | Public. |
| GET | `/slots/:id/availability` | — | Public. |
| POST | `/slots` | 🔒**Owner** | Station must already be `APPROVED`. |
| PUT | `/slots/:id/status` | 🔒**Owner** | |
| POST | `/slots/:id/auction/open` | 🔒**Owner** | Body: `{ durationMinutes }`. Slot must be `AVAILABLE`. |
| POST | `/slots/:id/auction/close` | 🔒**Owner** | Crowns the highest-priority bidder and auto-creates their `CONFIRMED` booking. |
| DELETE | `/slots/:id` | 🔒**Owner** | |

## Bookings (`/bookings`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/bookings` | 🔒**Verified** | Body: `{ slotId, evId, startTime, durationMinutes }`. Race-safe under real concurrent requests for the same window — optimistic insert, then deterministic reconciliation if two land at once (see Phase 7.2's concurrent-booking test). |
| GET | `/bookings` | 🔒 | Paginated. Query: `page, limit, status?`. |
| PATCH | `/bookings/:id/cancel` | 🔒 | |
| PATCH | `/bookings/:id/check-in` | 🔒 | Locks in `totalCost` from the planned window at this moment — completing later doesn't recompute it. |
| POST | `/bookings/:id/payment-intent` | 🔒 | Returns a Stripe `clientSecret` in live mode; in mock mode (no real Stripe key configured) it activates the payment directly after a simulated delay. See "Payments" below. |
| PATCH | `/bookings/:id/complete` | 🔒 | |
| PATCH | `/bookings/:id/owner-cancel` | 🔒**Owner** | |

## Auction / Bids (`/bids`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/bids/slot/:slotId` | — | Public leaderboard for an open auction. |
| POST | `/bids` | 🔒**Verified** | Body: `{ slotId, amount, batteryLevel }`. The slot's own owner is blocked from bidding on it. Priority = 60% normalized bid + 40% battery urgency (see README's formula section). |
| GET | `/bids/mine` | 🔒 | |
| GET | `/bids/results` | 🔒 | |
| PATCH | `/bids/:id/cancel` | 🔒 | |

## Payments (`/payments`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/payments/webhook` | Stripe signature | **Not** a normal API route — mounted before the global JSON body parser (Stripe's signature check needs the raw, unparsed request body). Handles `payment_intent.succeeded` (activates the booking, idempotently) and `.payment_failed` (emits `payment:failed` over Socket.IO so the customer can retry within their grace period). |
| GET | `/payments/history` | 🔒 | The caller's own payment history. |
| GET | `/payments/status/:transactionId` | 🔒 | `transactionId` is the Stripe PaymentIntent id (or a `pi_mock_*` id in mock mode). Scoped to the caller's own payments unless they're an admin. |

## Reviews (`/reviews`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/reviews/station/:stationId` | — | Public. |
| POST | `/reviews` | 🔒**EV_USER, Verified** | Upsert (one review per user per station). Gated to users who actually completed and paid for a session there. |
| DELETE | `/reviews/:id` | 🔒 | Own review, or any review if admin (moderation) — the admin path is separately audited. |

## Complaints (`/complaints`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/complaints` | — | **Public, no login required by design.** Rate-limited specifically because of that (10/15min) — see Phase 7.2. |
| GET | `/complaints` | 🔒**Admin** | |
| DELETE | `/complaints/:id` | 🔒**Admin** | |

## AI Recommendations (`/ai`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/ai/recommend` | 🔒 | Query: `latitude, longitude, batteryLevel, limit?`. See README's scoring-weights section. |

## Admin (`/admin`)

All routes below require 🔒**Admin**.

| Method | Path | Notes |
|---|---|---|
| GET | `/admin/dashboard` | Stats + a 6-month bookings chart. Safe against an empty database (aggregate sums default to 0, not `null`/crash). |
| GET | `/admin/users` | Paginated, filterable by `role`/`search`. |
| PATCH | `/admin/users/:id/block` | Audited. |
| PATCH | `/admin/users/:id/promote` | Promotes an existing user to `ADMIN`. Audited. Not covered by the e2e suite (Phase 5.1/7.1). |
| DELETE | `/admin/users/:id` | |
| GET | `/admin/stations` | Paginated, filterable by `status`. |
| PATCH | `/admin/stations/:id/status` | Body: `{ action: "APPROVED" | "REJECTED" }`. Invalidates the public station-list cache immediately. Audited. |
| GET | `/admin/bookings` | Paginated. |
| GET | `/admin/logs` | The audit trail itself — paginated. |

## Misc (mounted directly in `app.js`, not under `/api`)

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | Uptime/status check for deploy platforms. |
| GET | `/sitemap.xml` | Dynamically generated from approved stations, using `CLIENT_URL`. |

---

## Rate limits (current, as of Phase 6.2/7.2 — verified against the actual configured values, not assumed)

| Scope | Limit |
|---|---|
| Login | 5 / 15 min |
| Register | 10 / 15 min |
| Forgot password | 3 / 15 min |
| Admin setup | 5 / 15 min |
| OTP send/resend | 10 / 15 min |
| OTP verify | 20 / 15 min (looser than send — a real user re-entering a mistyped code shouldn't get locked out as fast as someone hammering for new codes) |
| Complaints (public, no auth) | 10 / 15 min |
| Everything else under `/api` | 300 / 15 min per IP |
