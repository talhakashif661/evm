# EV Management System — Complete Setup Guide
## Run on Localhost + All .env Keys Explained

---

## What you have (2 apps: 1 backend, 1 frontend — admin is built in)

```
ev-management/
├── backend/       → Express API server              → runs on port 5000
└── frontend/      → User-facing React app + Admin    → runs on port 3000
                      (Admin lives at /admin/*, same app, ADMIN role only)
```

Both must be running at the same time on localhost.

---

## Prerequisites — Install these first

| Tool | Download | Check if installed |
|------|----------|--------------------|
| Node.js 18+ | https://nodejs.org (LTS version) | `node -v` |
| npm | Comes with Node.js | `npm -v` |
| Git | https://git-scm.com | `git -v` |

> If `node -v` shows a version, you already have it. You need **Node 18 or higher**.

---

## Step 1 — Extract the ZIP

Unzip `ev-management-final.zip` anywhere on your computer.
You should see this structure inside:
```
ev-management/
├── backend/
├── frontend/       (Admin is merged in here, under /admin/*)
├── DEPLOYMENT.md
└── README.md
```

---

## Step 2 — Set up MongoDB Atlas (Free Database)

You need a free cloud MongoDB database. This takes 5 minutes.

1. Go to **https://cloud.mongodb.com** → Sign up free
2. Click **"Build a Database"** → Choose **M0 FREE** → Click **Create**
3. Choose any cloud provider + region → Click **Create Cluster**
4. **Database Access** (left sidebar) → **Add New Database User**
   - Username: `evadmin`
   - Password: click **"Autogenerate Secure Password"** → **copy and save this password**
   - Role: **Atlas admin** → **Add User**
5. **Network Access** (left sidebar) → **Add IP Address** → **Allow Access from Anywhere** (0.0.0.0/0) → **Confirm**
6. **Database** (left sidebar) → **Connect** → **Drivers**
   - Copy the connection string. It looks like:
     ```
     mongodb+srv://evadmin:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
     ```
   - Replace `<password>` with your actual password from step 4
   - Replace the database name: add `ev_management` before the `?`
   - Final result:
     ```
     mongodb+srv://evadmin:YOURPASSWORD@cluster0.xxxxx.mongodb.net/ev_management?retryWrites=true&w=majority
     ```
   - **Save this — it's your DATABASE_URL**

---

## Step 3 — Get a SendGrid API Key (for email/OTP)

The system sends OTP/booking/reset emails through **SendGrid's HTTPS API**
(not Gmail SMTP — most free hosting tiers, including Render's, block
outbound SMTP ports, so an API-based sender is what actually works in
production).

1. Sign up free at **https://signup.sendgrid.com** (100 emails/day on the free tier)
2. **Settings** (left sidebar) → **Sender Authentication** → verify the email
   address you'll send from (Single Sender Verification is enough — you
   don't need a custom domain). This has to match `EMAIL_FROM` below, or
   every send fails with a 403.
3. **Settings** → **API Keys** → **Create API Key** → choose **Restricted
   Access** → turn on **Mail Send** → **Create & View**
4. Copy the key (starts with `SG.`) — SendGrid only shows it once

> If you don't want email right now, you can skip this and the app still works — leave `SENDGRID_API_KEY` empty and OTP sending will just log a warning and be skipped, nothing crashes.

---

## Step 4 — Create the Backend .env file

Open the `backend/` folder. Create a new file called exactly `.env` (note the dot at the start).

Copy and paste this, filling in YOUR values:

```env
# ─── Database (from Step 2) ─────────────────────────────────
DATABASE_URL="mongodb+srv://evadmin:YOURPASSWORD@cluster0.xxxxx.mongodb.net/ev_management?retryWrites=true&w=majority"

# ─── JWT Secret ─────────────────────────────────────────────
# Any long random string — use this exactly or make your own
JWT_SECRET="ev-management-super-secret-jwt-key-2024-change-in-prod"
JWT_EXPIRES_IN="7d"

# ─── Server ─────────────────────────────────────────────────
PORT=5000
NODE_ENV="development"

# ─── Frontend URL for CORS (admin is merged into this same app) ────
CLIENT_URL="http://localhost:3000"

# ─── SendGrid (from Step 3) ──────────────────────────────────
SENDGRID_API_KEY="SG.xxxxxxxxxxxxxxxxxxxxxxxx"
EMAIL_FROM="EV Management <your-verified-sender@example.com>"

# ─── OTP Settings ───────────────────────────────────────────
OTP_EXPIRY_MINUTES=10
MAX_VERIFICATION_ATTEMPTS=3
VERIFICATION_BLOCK_HOURS=1
RESEND_COOLDOWN_SECONDS=60
```

**Every key explained:**

| Key | What it is | Example |
|-----|-----------|---------|
| `DATABASE_URL` | Your MongoDB Atlas connection string | `mongodb+srv://...` |
| `JWT_SECRET` | Secret used to sign login tokens. Any long random string. | `my-secret-abc-123` |
| `JWT_EXPIRES_IN` | How long login tokens last | `7d` = 7 days |
| `PORT` | Which port the backend runs on | `5000` |
| `NODE_ENV` | Environment mode | `development` |
| `CLIENT_URL` | URL of your frontend, admin included (CORS whitelist) | `http://localhost:3000` |
| `SENDGRID_API_KEY` | API key from SendGrid (Settings → API Keys), "Mail Send" permission | `SG.xxxxxxxxxxxxxxxx` |
| `EMAIL_FROM` | Display name + sender address — must be a **verified sender** in SendGrid | `EV Management <noreply@...>` |
| `OTP_EXPIRY_MINUTES` | How long the OTP code is valid | `10` |
| `MAX_VERIFICATION_ATTEMPTS` | Wrong OTP attempts before block | `3` |
| `VERIFICATION_BLOCK_HOURS` | How long blocked after 3 wrong attempts | `1` |
| `RESEND_COOLDOWN_SECONDS` | Wait time before resending OTP | `60` |

---

## Step 5 — Create Frontend .env file

Open the `frontend/` folder. Create a file called `.env`:

```env
VITE_API_URL=http://localhost:5000/api
```

That's it. This tells the frontend where the backend is.

---

## Step 6 — Install & Run (open 2 terminal windows)

### Terminal 1 — Backend

```bash
cd ev-management/backend

npm install

npx prisma generate

npx prisma db push

npm start
```

✅ You should see:
```
EV Management Server running on port 5000
Environment: development
```

> `npm install` — downloads all packages
> `npx prisma generate` — generates the Prisma database client
> `npx prisma db push` — creates all collections in MongoDB Atlas
> `npm start` — starts the server (`node server.js`). Use `npm run dev` instead for nodemon auto-restart during development.

---

### Terminal 2 — Frontend (User App + Admin, merged)

```bash
cd ev-management/frontend

npm install

npm start
```

✅ You should see:
```
VITE v5.x.x  ready in xxx ms
➜  Local:   http://localhost:3000/
```

Open your browser → **http://localhost:3000**
Admin users are automatically redirected to **http://localhost:3000/admin/dashboard** after login.

---

## Step 7 — Create an Admin Account

The system doesn't auto-create an admin. Do this once:

1. Go to **http://localhost:3000/register**
2. Register with any email/password
3. Then manually update the role in MongoDB Atlas:
   - Go to MongoDB Atlas → Browse Collections → `ev_management` → `users`
   - Find your user → Edit → change `role` from `"EV_USER"` to `"ADMIN"`
   - Save

4. Now log in to the **admin panel** at **http://localhost:3000** with those credentials

---

## Quick Test Checklist

After everything is running, test this flow:

- [ ] **http://localhost:5000/health** → shows `{"status":"OK"}`
- [ ] **http://localhost:3000** → Frontend loads
- [ ] **http://localhost:3000** → Admin panel loads
- [ ] Register a new user → OTP email arrives in inbox
- [ ] Enter OTP → email verified → banner disappears
- [ ] Register as STATION_OWNER → create a station
- [ ] Admin panel → approve the station
- [ ] Register as EV_USER → book a slot

---

## Common Problems & Fixes

| Problem | Cause | Fix |
|---------|-------|-----|
| `Cannot find module` | `npm install` not run | Run `npm install` in that folder |
| `DATABASE_URL invalid` | Wrong connection string | Re-copy from MongoDB Atlas → Connect → Drivers |
| `Authentication failed` (MongoDB) | Wrong password in DATABASE_URL | Check you replaced `<password>` correctly |
| `CORS error` in browser | CLIENT_URL wrong in .env | Make sure `CLIENT_URL=http://localhost:3000` in backend `.env` |
| `prisma generate` fails | Node version too old | Update Node.js to v18+ from nodejs.org |
| OTP email not received | Missing/invalid `SENDGRID_API_KEY`, or `EMAIL_FROM` isn't a verified sender | Check backend logs for the SendGrid error; re-verify the sender in SendGrid → Sender Authentication |
| `Port 5000 already in use` | Another app using port 5000 | Change `PORT=5001` in backend `.env` AND `VITE_API_URL=http://localhost:5001/api` in both frontend `.env` files |
| Admin login rejected | Role not set to ADMIN | Update role in MongoDB Atlas collections |

---

## File Structure Summary

```
ev-management/
├── backend/
│   ├── .env                  ← YOU CREATE THIS (Step 4)
│   ├── .env.example          ← Template showing all keys
│   ├── server.js             ← Entry point
│   ├── prisma/schema.prisma  ← Database schema
│   ├── controllers/          ← Business logic (10 files)
│   ├── routes/               ← API endpoints (11 files)
│   ├── middleware/           ← Auth, KYC, error handling
│   ├── services/             ← Verification OTP service
│   └── utils/                ← Email, JWT, Logger
│
└── frontend/
    ├── .env                  ← YOU CREATE THIS (Step 5)
    └── src/
        ├── pages/            ← All page components, incl. pages/admin/ (4 admin pages)
        ├── components/       ← Navbar, Banner, Spinner, AdminLayout
        └── store/slices/     ← Redux state, incl. admin* slices (11 slices)
```

---

## API Routes Reference

| Method | URL | Description | Auth |
|--------|-----|-------------|------|
| POST | `/api/auth/register` | Create account | Public |
| POST | `/api/auth/login` | Login | Public |
| POST | `/api/auth/send-otp` | Send verification email | Login required |
| POST | `/api/auth/verify-otp` | Verify OTP code | Login required |
| POST | `/api/auth/resend-otp` | Resend OTP | Login required |
| GET | `/api/stations` | List all approved stations | Public |
| POST | `/api/stations` | Create station | STATION_OWNER + Verified |
| GET | `/api/stations/owner/mine` | My station | STATION_OWNER |
| POST | `/api/bookings` | Book a slot | EV_USER + Verified |
| GET | `/api/bookings` | My bookings | Login required |
| POST | `/api/bids` | Place a bid | EV_USER + Verified |
| GET | `/api/admin/users` | All users | ADMIN only |
| PATCH | `/api/admin/stations/:id/status` | Approve/reject station | ADMIN only |
| GET | `/api/ai/recommendations` | AI station suggestions | Login required |
| GET | `/health` | Server health check | Public |
