# ⚡ ChargeEV — AI-Powered EV Charging Platform
### Final Year Project — Full Stack Production Application

---

## 🎨 Design

A warm cream/dark/gold palette, replacing the original green EV-management
theme (see `CHANGELOG.md` Phase 2 for the full rationale and before/after).

| Token | Hex | Used for |
|---|---|---|
| `--bg-primary` | `#FDF8F0` | Page background |
| `--bg-dark` | `#1A1A1A` | Navbar, primary buttons |
| `--accent-gold` | `#C9A96E` | Active nav link, accents |
| `--text-primary` | `#1A1A1A` | Headings |
| `--text-secondary` | `#4A4A4A` | Body text |
| `--text-muted` | `#6E6E6E` | Captions, labels (contrast-verified 4.82:1 — Phase 7.3) |

All colors are CSS custom properties in `frontend/src/index.css` — nothing
is a hardcoded one-off hex value scattered through components.

**Mockups** (illustrations of the real design system generated from its
actual color values and layout — not literal screenshots of a running
instance, since that needs a live browser + backend + database this
sandboxed environment doesn't have; swap in real ones once deployed):

![Hero section](docs/screenshots/hero-mockup.png)
![Components — buttons, cards, badges, form fields, navbar](docs/screenshots/components-mockup.png)

---

## 🌐 Live Deployment

Not currently deployed anywhere public. See `DEPLOYMENT.md` for the
Render (backend) + Vercel (frontend) deployment guide, including the
environment variables and CORS/redirect configuration it needs.

---

## 🗂️ Project Structure

```
ev-management/
├── backend/                  # Node.js + Express API
│   ├── controllers/          # MVC Controllers
│   ├── routes/               # Express route definitions
│   ├── middleware/           # Auth, error handling
│   ├── utils/                # JWT, SendGrid, Prisma client
│   ├── prisma/
│   │   ├── schema.prisma     # MongoDB data models
│   │   └── seed.js           # Sample data seeder
│   ├── server.js             # Entry point
│   └── .env.example          # Environment template
│
├── frontend/                 # React Vite (EV User + Station Owner + Admin)
│   └── src/
│       ├── components/       # Navbar, Spinner, AdminLayout (admin sidebar shell), etc.
│       ├── pages/            # Landing, Login, Dashboard, MyEVs,
│       │                       Stations, Bookings, Auction, AI, Owner
│       │   └── admin/        # AdminDashboard, AdminUsers, AdminStations, AdminBookings
│       ├── store/            # Redux Toolkit store + slices (incl. admin* slices)
│       └── utils/            # Axios API instance
```

Admin is **not** a separate app — it's routed at `/admin/*` inside this same React
project and only renders for users with the `ADMIN` role (see `PrivateRoute` in `App.jsx`).

---

## 🚀 Quick Setup

### Prerequisites
- Node.js v18+
- MongoDB Atlas account (free tier works)
- npm or yarn

---

### Step 1 — Clone & Install

The root `package.json` has convenience scripts for everything below —
`npm run install:all` does both installs in one command:

```bash
npm run install:all
```

...or manually, if you'd rather run each side separately:

```bash
# Backend
cd ev-management/backend
npm install

# Frontend (includes Admin — no separate install)
cd ../frontend
npm install
```

**Fastest path to a working `.env`:** from the repo root, `npm run
setup:env` copies both `.env.example` files and generates real random
values for `JWT_SECRET`/`ADMIN_SETUP_KEY` — it never overwrites an
existing `.env`. Steps 2–3 below are the manual/from-scratch version if
you'd rather fill everything in yourself.

---

### Step 2 — Configure Backend Environment

```bash
cd ev-management/backend
cp .env.example .env
```

Edit `.env`:

```env
DATABASE_URL="mongodb+srv://YOUR_USER:YOUR_PASS@cluster.mongodb.net/ev_management?retryWrites=true&w=majority"
JWT_SECRET="change_this_to_a_long_random_string_minimum_32_chars"
JWT_EXPIRES_IN="7d"
PORT=5000
CLIENT_URL="http://localhost:3000"

# SendGrid (Render's free tier blocks outbound SMTP, so email goes over
# SendGrid's HTTPS API instead of Gmail/nodemailer SMTP)
SENDGRID_API_KEY="your_sendgrid_api_key"
EMAIL_FROM="EV Management <noreply@evmanagement.com>"

NODE_ENV="development"
```

**Getting a SendGrid API Key:**
1. Sign up free at [sendgrid.com](https://signup.sendgrid.com) (100 emails/day on the free tier)
2. Settings → Sender Authentication → verify the address (or domain) you'll use as `EMAIL_FROM` — sends from an unverified sender get a 403, even with a valid key
3. Settings → API Keys → Create API Key → "Restricted Access" with at least "Mail Send" permission
4. Copy the key into `SENDGRID_API_KEY` (shown once — if you lose it, revoke and generate a new one)

---

### Step 3 — Set Up MongoDB Atlas

1. Go to [mongodb.com/atlas](https://www.mongodb.com/atlas)
2. Create a free cluster
3. Create a database user with password
4. Add IP `0.0.0.0/0` to IP Access List (Network Access)
5. Click "Connect" → "Connect your application" → copy the URI
6. Replace `YOUR_USER`, `YOUR_PASS`, and cluster URL in `.env`

---

### Step 4 — Generate Prisma Client & Push Schema

From the repo root:
```bash
npm run db:generate
npm run db:push
npm run db:seed      # optional but recommended
```

...or, run from inside `backend/` directly:
```bash
cd ev-management/backend

# Generate Prisma client
npx prisma generate

# Push schema to MongoDB
npx prisma db push

# Seed sample data (optional but recommended)
node prisma/seed.js
```

---

### Step 5 — Start All Services

Open 2 terminal windows:

**Terminal 1 — Backend:**
```bash
cd ev-management/backend
npm start
# or: npm run dev   (nodemon, auto-restart)
# Server starts on http://localhost:5000
```

**Terminal 2 — Frontend (includes Admin at /admin/*):**
```bash
cd ev-management/frontend
npm start
# App starts on http://localhost:3000
```

---

## 🔑 Demo Credentials (After Seeding)

| Role           | Email                          | Password   |
|----------------|--------------------------------|------------|
| Station Owner  | owner1@evmanagement.com        | Owner@123  |
| Station Owner  | owner2@evmanagement.com        | Owner@123  |
| EV User        | alice@example.com              | User@123   |
| EV User        | bob@example.com                | User@123   |

Admins are **not** seeded automatically — see the next section to create the
first one via Postman.

---

## 🔐 Creating the First Admin (via Postman)

Admin accounts are intentionally excluded from the public `/register` endpoint
and from the seed script. The very first admin is created by calling a
key-protected endpoint directly (e.g. from Postman), and from then on it's a
normal row in MongoDB — it persists permanently, survives logout, restarts,
and redeploys, exactly like any other user.

1. In `backend/.env`, set a long random secret:
   ```
   ADMIN_SETUP_KEY="something-long-and-random"
   ```
2. Start the backend, then send this request from Postman (or curl):
   ```
   POST http://localhost:5000/api/auth/setup-admin
   Headers:
     Content-Type: application/json
     x-setup-key: something-long-and-random
   Body (raw JSON):
   {
     "name": "System Admin",
     "email": "admin@evmanagement.com",
     "password": "Admin@123",
     "phone": "+1-000-000-0000"
   }
   ```
3. You'll get back the created admin user + a JWT token. The account is now
   saved permanently in MongoDB with role `ADMIN`.
4. The endpoint refuses to run again once *any* admin already exists in the
   database (`409 Conflict`), so it can't be used to mint unlimited admins —
   additional admins, if you ever need them, should be promoted by an
   existing admin through the admin panel/API instead.
5. Log in normally at `/login` with that email/password from then on; the
   session persists across logout/login because the account lives in Mongo,
   not in memory.

---

## 🌐 Application URLs

| App                     | URL                          |
|-------------------------|------------------------------|
| Frontend (incl. Admin)  | http://localhost:3000        |
| Admin Panel             | http://localhost:3000/admin  |
| Backend API             | http://localhost:5000/api    |
| Health Check            | http://localhost:5000/health |

---

## 📡 Key API Endpoints

This is a curated overview. **`API.md` is the exhaustive reference** —
every route, its auth requirements, and notes on the less-obvious behavior
(rate limits, caching, what's audited) — kept in sync with the actual route
files; if this section and `API.md` ever disagree, trust `API.md`.

### Authentication
```
POST /api/auth/register         Register (EV_USER or STATION_OWNER)
POST /api/auth/setup-admin      Bootstrap the first ADMIN (key-protected, Postman only)
POST /api/auth/login            Login all roles
POST /api/auth/forgot-password  Request a reset link by email
POST /api/auth/reset-password   Reset password with { email, token, newPassword }
GET  /api/auth/me               Get current user (this is where profile data actually comes from)
PUT  /api/auth/change-password
```

### Profile
```
PUT /api/users/profile        Update name / phone / avatar (base64, <50KB, verified by real magic bytes)
```


### EV Management
```
GET    /api/evs               My EVs
POST   /api/evs               Add EV
PUT    /api/evs/:id           Update EV
DELETE /api/evs/:id           Delete EV
PATCH  /api/evs/:id/battery   Update battery %
```

### Stations
```
GET  /api/stations            All approved stations (public)
GET  /api/stations/:id        Station detail + slots
POST /api/stations            Create station (owner only)
GET  /api/stations/owner/mine My station
GET  /api/stations/owner/revenue Revenue summary
```

### Slots
```
GET  /api/slots/station/:id   Get slots for a station
POST /api/slots               Add slot (owner)
PUT  /api/slots/:id/status    Update slot status
POST /api/slots/:id/auction/open  Open auction
POST /api/slots/:id/auction/close Close auction & pick winner
```

### Bookings
```
POST   /api/bookings          Create booking
GET    /api/bookings          My bookings (paginated)
PATCH  /api/bookings/:id/cancel
PATCH  /api/bookings/:id/complete
```

### Auction (Bids)
```
POST  /api/bids               Place bid
GET   /api/bids/slot/:id      Slot leaderboard
GET   /api/bids/mine          My bids
GET   /api/bids/results       Auction results
PATCH /api/bids/:id/cancel    Cancel bid
```

### Payments (Stripe)
```
POST /api/bookings/:id/payment-intent   Start payment — real Stripe in production, a
                                         simulated mock flow in local dev with no key set
POST /api/payments/webhook               Stripe calls this back; NOT called by the frontend
GET  /api/payments/history               My payment history
GET  /api/payments/status/:transactionId
```

### Reviews & Complaints
```
GET    /api/reviews/station/:id   Public
POST   /api/reviews               One review per user per station; must have paid for a session there
DELETE /api/reviews/:id           Own review, or any review if admin (audited)
POST   /api/complaints            Public — no login required, rate-limited because of that
GET    /api/complaints            Admin only
DELETE /api/complaints/:id        Admin only
```

### AI Recommendations
```
GET /api/ai/recommend?latitude=&longitude=&batteryLevel=&limit=
GET /api/ai/route?latitude=&longitude=&batteryLevel=
```

### Admin
```
GET   /api/admin/dashboard
GET   /api/admin/users
PATCH /api/admin/users/:id/block
PATCH /api/admin/users/:id/promote    Promote an existing user to ADMIN
DELETE/api/admin/users/:id
GET   /api/admin/stations
PATCH /api/admin/stations/:id/status  { action: "APPROVED" | "REJECTED" }
GET   /api/admin/bookings
```

---

## 🤖 AI Recommendation Algorithm

**Scoring Weights:**
- Distance: 30% (penalty per km from user)
- Price per kWh: 25% (lower = better)
- Slot Availability: 25% (available/total ratio)
- Battery Urgency Modifier: 20% (multiplied against availability)

**Battery Urgency Scale:**
- ≤ 20%: Emergency (3x multiplier) + 20 point urgency bonus
- ≤ 40%: High (2x)
- ≤ 60%: Medium (1.5x)
- > 60%: Normal (1x)

---

## 🏆 Auction Priority Formula

```
Priority = (NormalizedBid × 0.6) + (BatteryUrgency × 0.4) × 100

BatteryUrgency:
  ≤ 20% → 1.0 (critical)
  ≤ 40% → 0.7 (high)
  ≤ 60% → 0.4 (medium)
  > 60% → 0.1 (low)
```

Users with low battery automatically gain higher priority,
ensuring emergency EV drivers get charging first.

---

## 🧰 Tech Stack Summary

| Layer        | Technology                                   |
|--------------|-----------------------------------------------|
| Frontend     | React 18, Vite, Redux Toolkit                 |
| UI Library   | Bootstrap 5 (grid), Framer Motion             |
| Maps         | react-leaflet + OpenStreetMap (no API key)    |
| Fonts        | Self-hosted Inter (`@fontsource/inter`) — not Google Fonts' CDN, so the critical weight can genuinely be preloaded (Phase 6.1) |
| SEO          | react-helmet-async                            |
| Payments     | Stripe (`@stripe/react-stripe-js`, `@stripe/stripe-js` on the frontend; `stripe` on the backend) — with a mock-payment fallback mode for local dev with no real Stripe key |
| Real-time    | Socket.IO (live bid/auction updates)          |
| HTTP Client  | Axios                                         |
| Routing      | React Router DOM v6                           |
| A11y/props   | prop-types (on all reusable components)       |
| Backend      | Node.js, Express.js                           |
| Validation   | express-validator                             |
| ORM          | Prisma (MongoDB adapter)                      |
| Database     | MongoDB Atlas                                 |
| Auth         | JWT (jsonwebtoken) + bcryptjs                 |
| Email        | SendGrid (HTTPS API)                          |
| Rate Limit   | express-rate-limit                            |
| Testing      | Jest + Supertest (backend, 54 e2e tests)      |
| Charts       | Recharts (admin panel)                        |
| Bundle analysis | rollup-plugin-visualizer (`npm run build:analyze`, opt-in only) |

---

## 🏗️ System Architecture

```
[React Frontend + Admin]  →  Axios          →  [Express API]  →  [Prisma ORM]  →  [MongoDB Atlas]
        :3000                                      :5000
[React Frontend]          →  Socket.IO (WS) →  [Express API]   (live bid/auction updates)

[Express API]  →  [SendGrid API]  →  User Emails
[Express API]  →  [AI Service]  →  Scoring Algorithm  →  Ranked Stations
```

---

## 🔴 Real-Time Updates (Socket.IO)

Bid and auction activity pushes to connected clients instead of relying on
polling/refresh:

- `AuctionHub.jsx` joins a room per open slot and refetches the moment
  someone else bids (`bid:update`) or an auction closes (`auction:closed`),
  and shows a persistent (not auto-dismissing after 3s) toast plus a
  synthesized chime on `auction:won` (Phase 5.3).
- `OwnerDashboard.jsx` joins a room for the owner's station and shows a
  toast the instant a new bid lands (`bid:new`), and gets
  `station:status-changed` when an admin approves/rejects their station.
- `Bookings.jsx` and `StationDetail.jsx` react to `payment:failed` (emitted
  from the Stripe webhook handler when a payment fails, so the customer can
  retry within their grace period) and booking status changes.
- Server-side, these are emitted from `bid.controller.js`,
  `slot.controller.js`, `admin.controller.js`, and `payment.routes.js`'s
  webhook handler, all via `utils/socket.js`, which wraps a single shared
  `Server` instance so any controller can `getIO()?.to(room).emit(...)`
  without needing sockets to be initialized (safe no-op if not).
- **Honest limitation** (Phase 7.1): the emit code above is real and
  verified correct by inspection, but the e2e suite is HTTP-based and can't
  prove a connected socket client actually *receives* these events —
  that's a different, harder claim than "the code is right."

---

## ✅ Input Validation

`express-validator` (already a dependency, previously unused) now guards:
register, login, forgot/reset-password, booking creation, and bid placement
— see `backend/validators/*.js` and `backend/middleware/validate.js`. Invalid
requests get a consistent `400 { success:false, message, errors:[...] }`
instead of each controller re-implementing its own ad-hoc checks.

---

## 🧪 Testing

```bash
cd backend
npm test
```

54 e2e tests (Jest + Supertest, DB-free via an in-memory Prisma mock) cover
every core flow end-to-end — registration through auction-win through
payment — including a genuine concurrent-request test for the booking
race-condition path (`Promise.all`, not sequential requests — see
`PHASE_7.2_EDGE_CASES_REPORT.md` for why that distinction matters). See
`backend/tests/README.md` for what's covered and how to extend with
DB-backed integration tests once you have a disposable test database.

---

## 🔐 Security Features

- JWT Bearer token authentication on all protected routes — purely
  header-based, no cookies, which is why CSRF (which exploits automatic
  cookie attachment) doesn't apply to this API's architecture at all
  (verified, not assumed — see Phase 7.2). The trade-off: the JWT lives in
  `localStorage`, so an XSS vector anywhere would mean token theft — see
  the XSS point below for what closes that specific gap.
- bcrypt password hashing (12 salt rounds)
- Role-based access control (EV_USER, STATION_OWNER, ADMIN)
- express-rate-limit: 300 req/15min per IP baseline, with tighter limits on
  login (5), register (10), forgot-password (3), admin setup (5), OTP
  send/resend (10), OTP verify (20), and complaints (10 — the one write
  endpoint that's public/unauthenticated by design, see Phase 7.2)
- Password reset tokens are SHA-256 hashed at rest and expire after 30 minutes
- express-validator on register/login/forgot-password/reset-password/bookings/bids
- Uploaded avatar/station images are verified by actual magic bytes
  (JPEG/PNG/WebP), not just a claimed MIME-type prefix (Phase 7.2)
- All 12 transactional email templates auto-escape user-controlled values
  (registration name, station name) before interpolating them into HTML —
  closes a real stored-XSS-via-email vector found in Phase 7.2
- Concurrent booking requests for the same window are race-safe: an
  optimistic insert followed by a deterministic reconciliation, verified
  under actual `Promise.all` concurrency in Phase 7.2's test suite, not
  just sequential testing
- CORS restricted to frontend origins, shared allow-list between Express
  and Socket.IO so they can't drift apart
- Admin-only routes protected by double middleware

---

## 📧 Email Notifications

Triggered automatically for:
- New user registration (Welcome email)
- Booking confirmed
- Station approved by admin
- Auction won notification

---

## 🌱 Sample Data (Seed)

After running `node prisma/seed.js`:
- 5 users (1 admin, 2 owners, 2 EV users)
- 2 approved charging stations in New York
- 7 charging slots (various statuses)
- 1 slot with active auction
- 2 EVs registered

---

## 🛠️ Troubleshooting

**Prisma can't connect to MongoDB:**
- Make sure the URI uses `mongodb+srv://` format
- Check IP whitelist in MongoDB Atlas (add 0.0.0.0/0)
- Ensure DB user has read/write permissions

**Email not sending:**
- Make sure `SENDGRID_API_KEY` is set — if it's empty, `sendEmail()` logs a warning and skips sending on purpose (no crash, no retry)
- Confirm `EMAIL_FROM`'s address is a **verified sender** in SendGrid (Settings → Sender Authentication) — an unverified sender fails with a 403
- Check the backend logs — SendGrid's rejection reason (bad key, unverified sender, suppressed recipient, etc.) is logged there
- Emails are non-blocking — server won't crash if email fails

**Frontend can't reach API:**
- Make sure backend is running on port 5000
- Vite proxy is configured in `vite.config.js`
- Check CORS in `.env` matches your frontend URL

**"Slot not in auction mode" error:**
- Station must be APPROVED before adding slots
- Slot must be AVAILABLE before opening auction
