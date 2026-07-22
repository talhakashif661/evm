# ChargeEV — Deployment Guide (Frontend: Vercel · Backend: Render)

## Architecture
```
ev-management/
├── backend/        → Render (persistent Node process — required for Socket.IO)
└── frontend/       → Vercel (includes Admin, routed at /admin/*, same deployment)
```

Two deployments total. Admin is not a separate app — it's gated by role
inside the same frontend build, at `/admin/*`.

---

## Step 1 — MongoDB Atlas (do this first)

1. https://cloud.mongodb.com → create a free **M0 cluster**.
2. Database Access → add a DB user, note the username/password.
3. Network Access → Add IP → **0.0.0.0/0**. Render's free/starter tiers use
   dynamic outbound IPs, so you can't allowlist a fixed one without a paid
   static-IP add-on.
4. Clusters → Connect → Drivers → copy the `mongodb+srv://...` string,
   fill in your password, and set the database name to `ev_management`.
5. This is your `DATABASE_URL`. It must be the Atlas `mongodb+srv://` form —
   Prisma requires MongoDB running as a replica set, which a plain local
   `mongod` does not provide by default.

---

## Step 2 — Backend on Render

New → Web Service → connect the repo:

| Setting        | Value           |
|----------------|-----------------|
| Root Directory | `backend`       |
| Build Command  | `npm install`   |
| Start Command  | `npm start`     |
| Health Check Path | `/health`    |

`npm install` now also runs `prisma generate` automatically via a
`postinstall` script — **without it, a fresh install would crash on the
very first database query** ("`@prisma/client did not initialize yet`").
You don't need to add `prisma generate` to the build command yourself.

**Environment variables** — copy every key from `backend/.env.example` and
fill in real values:

```
DATABASE_URL        = your MongoDB Atlas connection string
JWT_SECRET           = a long random string, NOT the placeholder
JWT_EXPIRES_IN       = 7d
NODE_ENV             = production          ← Render does not set this for you
CLIENT_URL           = https://your-frontend.vercel.app   ← fill in after Step 3, no trailing slash
SENDGRID_API_KEY     = SG.xxxxxxxxxxxxxxxxxxxxxxxx   ← Render's free tier blocks outbound SMTP, so this uses SendGrid's HTTPS API instead of Gmail/nodemailer
EMAIL_FROM           = EV Management <your-verified-sender@example.com>
OTP_EXPIRY_MINUTES   = 10
MAX_VERIFICATION_ATTEMPTS = 3
VERIFICATION_BLOCK_HOURS  = 1
RESEND_COOLDOWN_SECONDS   = 60
ADMIN_SETUP_KEY      = a long random secret (see Step 5)
```

`CLIENT_URL` matters more than it looks: it's used for CORS, for Socket.IO's
CORS check, and to build the link inside password-reset emails. If it's
wrong or missing, cross-origin requests from Vercel will be rejected outright.

Deploy, then copy the resulting URL (e.g. `https://ev-backend.onrender.com`).

**Cold starts**: Render's free tier spins the service down after ~15 minutes
idle; the first request after that takes 30-60s. That's a hosting-tier
behavior, not a bug — upgrade to a paid instance if you need it always warm.

---

## Step 3 — Prisma schema sync (automatic — nothing to do)

You never run `npx prisma db push` by hand. The backend's `package.json` has:

```json
"prestart": "prisma db push"
```

npm runs `prestart` automatically before `start`, so **every `npm start`
first syncs `prisma/schema.prisma` to whatever database `DATABASE_URL`
points at, then boots the server**. `db push` is idempotent — when nothing
changed it just verifies and moves on.

This covers everywhere the app runs:
- **Locally:** `npm start` syncs your Atlas DB, then starts on :5000.
- **Render:** its Start Command is `npm start`, so every deploy (and every
  wake from sleep) self-syncs. It adds a couple of seconds to a cold start.
- If the sync fails (bad `DATABASE_URL`, Atlas IP not allowed), the server
  refuses to start and shows the real error — much clearer than booting and
  crashing on the first query.

Manual escape hatch if you ever want it: `npm run db:push`.

---

## Step 4 — Frontend on Vercel

New Project → import the repo:

| Setting          | Value                        |
|------------------|-------------------------------|
| Root Directory   | `frontend`                    |
| Framework Preset | Vite (auto-detected)          |
| Build Command    | `npm run build` (auto-filled) |
| Output Directory | `dist` (auto-filled)          |

**Environment variables:**
```
VITE_API_URL  = https://your-backend.onrender.com/api
VITE_PKR_RATE = 280        ← optional; the code falls back to 280 if unset
```
Include the `/api` suffix — both `utils/api.js` and `utils/socket.js` expect
it (the socket client strips it back off to get the bare origin for the
WebSocket connection). Vite bakes this in at **build time**, so changing it
later requires a new deploy, not just a restart.

`frontend/vercel.json` already has the SPA rewrite so refreshing on a
client-side route like `/dashboard` doesn't 404. It also has:
- Two **real 301 redirects** (`/owner/slots`, `/owner/bookings` →
  `/owner/station`) — these routes moved; a real edge-level 301 is what lets
  a crawler follow the move properly, unlike a client-side-only
  React Router redirect (which returns 200, not 301, to anything that
  doesn't run the page's JS).
- A **rewrite proxying `/sitemap.xml`** to the backend's dynamic sitemap
  endpoint (`GET /sitemap.xml` in `backend/app.js`, which queries real
  APPROVED stations — see that file's comment). Search engines expect
  `sitemap.xml` at the site's own root, not the API's, so this stitches the
  two together. **Before deploying, replace the placeholder
  `your-backend.onrender.com` in `vercel.json`'s rewrite with your real
  Render URL** — this couldn't be known from the dev sandbox this was built
  in, and Vercel's rewrite ordering matters here (the sitemap rule must stay
  above the catch-all `/(.*)`, or the catch-all will shadow it and serve
  `index.html` instead).

Deploy, then go back to Render and update `CLIENT_URL` to this real Vercel
URL if you'd set a placeholder earlier — redeploy the backend so
CORS/Socket.IO/reset-emails pick up the change.

---

## Step 5 — Create the first Admin (via Postman)

Admins are never created through the public `/register` form. Once the
backend is live:

```
POST https://your-backend.onrender.com/api/auth/setup-admin
Headers:
  Content-Type: application/json
  x-setup-key: <your ADMIN_SETUP_KEY>
Body:
{
  "name": "System Admin",
  "email": "admin@yourcompany.com",
  "password": "a-real-password"
}
```

This only works once — it refuses if any admin already exists. Full details
in the main `README.md`.

---

## Step 6 — Smoke test all three roles

Before calling it done, actually walk through:
- Register an `EV_USER`, receive and use the email verification code.
- Register a `STATION_OWNER`, create a station, add a slot.
- Log in as the admin from Step 5, approve the station.
- Book a slot as the EV user; place a bid on an auctioned slot from a second
  browser/tab and confirm the first tab's Auction Hub updates live
  (Socket.IO working cross-origin).
- Try "Forgot password" end to end — confirm the emailed link points at the
  Vercel URL, not localhost.
- Upload a profile avatar and confirm it persists after logout/login.
- Complete + pay for a booking, then open **Payments** in the navbar — the
  payment should appear with the correct PKR amount.
- As admin, open **Audit Log** in the sidebar — you should at least see the
  `ADMIN_BOOTSTRAPPED` entry from Step 5 and the station approval.

---

## Running Locally

```bash
# Terminal 1 — Backend
cd backend
cp .env.example .env      # fill in your values (one time)
npm install                # one time — also runs `prisma generate` automatically
npm start                  # syncs the DB schema, then serves http://localhost:5000

# Terminal 2 — Frontend (includes Admin at /admin/*)
cd frontend
npm install                # one time
npm start                  # http://localhost:3000
```

To inspect what's actually taking up space in the production bundle, run
`npm run build:analyze` (frontend) and open the generated
`dist/bundle-analysis.html` in a browser — an interactive treemap, opt-in
only so this internal dev artifact never ships with a normal `npm run
build`/deploy.

That's the whole workflow: `npm install` once per folder, then `npm start`
in both terminals every time. (`npm run dev` on the backend still exists if
you're actively editing backend code — same server, but it auto-restarts on
every file save.)

**Run the test suite** (needs NO database or .env — it uses an in-memory DB):
```bash
cd backend && npm test      # expected: 126/126 passing (9 suites)
```

---

## Troubleshooting

| Symptom | Cause → Fix |
|---|---|
| Browser console shows a **CORS error** | `CLIENT_URL` on Render is missing or doesn't exactly match your Vercel URL (https, no trailing slash). Fix it and redeploy the backend. |
| First request takes 30–60 s | Render free tier sleeps after ~15 min idle — cold start, not a bug. Warm it up before a demo. |
| Every API call fails / instantly logged out | `VITE_API_URL` is wrong (missing `/api` or pointing at localhost). Fix and **redeploy** the frontend — Vite bakes it in at build time. |
| `PrismaClientInitializationError` in Render logs | `DATABASE_URL` typo, or Atlas Network Access doesn't include `0.0.0.0/0`. |
| `Unknown argument plannedEndTime` on booking | The schema wasn't synced/generated. Start the backend with `npm start` (its `prestart` hook syncs automatically), and make sure `npm install` completed (it runs `prisma generate`). |
| OTP emails never arrive | `SENDGRID_API_KEY` missing/invalid, or `EMAIL_FROM` isn't a verified sender in SendGrid (Settings → Sender Authentication) — check Render's logs for the exact SendGrid error, or check spam. The app itself keeps working — email is fire-and-forget. |
| Refreshing `/dashboard` gives a 404 | SPA rewrite missing — `frontend/vercel.json` (Vercel) or a `_redirects` file with `/* /index.html 200` (Netlify). |
| `setup-admin` returns **403** | `x-setup-key` header ≠ `ADMIN_SETUP_KEY` env var. |
| `setup-admin` returns **409** | An admin already exists — just log in with it (this is the by-design one-time lock). |

---

## SendGrid API Key Setup

1. https://signup.sendgrid.com — free tier covers 100 emails/day.
2. **Settings → Sender Authentication** → verify the address you'll put in
   `EMAIL_FROM` (Single Sender Verification, no domain needed). Sends from an
   unverified sender fail with a 403 even with a valid key.
3. **Settings → API Keys → Create API Key** → Restricted Access → enable
   **Mail Send**.
4. Copy the key (starts with `SG.`, shown once) into Render's
   `SENDGRID_API_KEY` env var.

---

## Fixes applied specifically for the Render + Vercel split

Found and fixed while preparing for this exact deployment — without them the
app would have broken in production, not just been suboptimal:

- **`app.set('trust proxy', 1)`** (`backend/app.js`) — Render sits behind a
  reverse proxy. Without this, `express-rate-limit` v7 either lumps every
  user under one IP or throws a validation error on the `X-Forwarded-For`
  header, breaking login/register/every rate-limited route.
- **`postinstall: prisma generate`** (`backend/package.json`) — a plain
  `npm install` does not generate the Prisma Client by itself.
- **`engines.node` pinned** in `backend/package.json` — avoids Render
  silently picking an unexpected Node version.
- **Removed `backend/vercel.json`** — it described deploying `server.js` as
  a Vercel serverless function, which no longer applies: `server.js` starts
  a persistent `http.Server` for Socket.IO, which serverless functions can't
  sustain. Since you're using Render for the backend, this file was dead
  and actively misleading to leave around.
