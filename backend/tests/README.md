# Backend Tests

```bash
npm install   # pulls in jest + supertest (added to devDependencies)
npm test
```

## What's here

These hit the real Express app (via `app.js`, which has no side effects on
import, unlike `server.js` which starts listening). None of them need a
database: the guard tests fail fast at `express-validator` or `authenticate`
before any query happens, and the rest swap Prisma for the in-memory client
in `tests/helpers/`. That means they run anywhere, with zero setup, in CI or
locally, with no `DATABASE_URL` required.

One exception worth knowing about: `socket.realtime.test.js` binds a real
TCP port (ephemeral, on loopback). If you run tests in a sandbox that
forbids listening sockets, that's the suite that will fail — nothing else
here opens a port.

- `auth.validation.test.js` — register/login field validation, the
  `setup-admin` key-protection check, and the health check.
- `booking-bid.guard.test.js` — confirms booking/bid creation correctly
  401s without a valid JWT.
- `priority.scoring.test.js` — pure-function tests for the auction
  priority-scoring formula (60% normalized bid + 40% battery urgency).
- `verification.otp.test.js` — the email-verification (OTP) flow: send,
  verify, expiry, wrong code, cooldown, and the status endpoint. The code
  is stored as a sha256 hash and never in plaintext, so the send path is
  asserted on its *effect* (a hash + expiry get written) while the verify
  path is driven by planting a known hash — the only way to reach the
  success branch without weakening the hashing itself.
- `ai-recommend.test.js` — the station recommendation scorer. Assertions are
  about *ordering* and relative score, never exact numbers: pinning
  "station A scores 82.4" would turn every future weight tweak into a
  spurious failure, whereas "the nearer station outranks the further one,
  all else equal" stays true across any sane retune and actually states the
  product requirement.
- `ev-slot.crud.test.js` — EV and slot create/update/delete, focused on the
  ownership guards. Every rejection test also re-reads the record: a 403
  that still mutated the row is worse than a 200, and a status-code-only
  assertion can't tell those apart.
- `socket.realtime.test.js` — the only suite that opens a port. Starts a
  real HTTP server on an ephemeral port and connects real
  `socket.io-client` instances, because sockets can't be exercised
  in-process the way Express can. Includes the negative cases: a client
  holding user A's token must not receive user B's notifications, and a
  client-supplied `join:user` must be ignored.
- `e2e.smoke.test.js` — the full success-path integration test described
  below **has been added** (this section originally said it wasn't done
  yet — it was written after this file, so update it here rather than
  leave both versions of the story in the repo). It swaps Prisma for an
  in-memory client (`tests/helpers/inMemoryPrisma.js`) instead of needing a
  real database, so it runs anywhere with zero setup too.

## Full end-to-end coverage

`e2e.smoke.test.js` drives the real Express app — real routes, middleware,
controllers, bcrypt, JWT — through the whole product flow: admin bootstrap,
registration, role guards, station approval, time-window bookings with
overlap rejection, check-in, a locally-signed fake Stripe webhook paying a
booking exactly once (idempotent on retry), auctions (priority ranking,
close, winner booking), and admin audit logs. No real database or network
access required — see the comment at the top of that file for the full list.

## What's _not_ here (and how to add it)

Real integration tests against an **actual** MongoDB (not the in-memory
mock) still don't exist — every current test either fails fast before
touching Prisma, or swaps it out entirely. To add real DB-backed tests:

1. Point `DATABASE_URL` at a disposable test database (a separate MongoDB
   Atlas free-tier cluster/db works fine — don't point tests at production).
2. In each test file, seed what you need directly via `prisma` before
   asserting against the API (`import prisma from '../utils/prisma.js'`),
   and clean up in `afterAll`.
3. For true unit tests of a controller in isolation (no DB at all), mock
   `../utils/prisma.js` with `jest.unstable_mockModule` (required for ESM)
   _before_ importing the controller under test — Jest's ESM support means
   the mock has to be registered before the dynamic `import()` that pulls in
   the module you're testing.

This wasn't set up in this pass because it needs a real, reachable
`DATABASE_URL` to run against, which isn't available in this environment.
