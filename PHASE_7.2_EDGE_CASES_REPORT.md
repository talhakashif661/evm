# Phase 7.2 — Edge Case Testing

**Method:** real fixes verified by re-running the live e2e suite (now 54
tests, up from 53 — one genuinely new test added this phase), plus direct
code tracing for anything not exercisable that way. Two real, fixable gaps
found and fixed; one architectural trade-off disclosed honestly rather than
silently accepted or silently changed.

---

## 1. Empty database — verified safe

Checked the admin dashboard stats aggregation specifically (the most likely
place a zero-row database causes a crash): `totalRevenue._sum.totalRevenue
|| 0` already correctly defaults when Prisma's aggregate sum returns `null`
over an empty set — no division-by-zero risk (there's no averaging here,
just counts and sums). `ratingStatsFor([])` already early-returns `{}` for
zero station IDs rather than issuing a query with an empty `in: []`. Combined
with the extensive `EmptyState` UI already built across every list page
(Phases 3.3/5.3), this is in good shape. No changes needed.

## 2. Invalid dates/times — already covered, confirmed live

`rejects a start time in the past and an out-of-range duration` — this was
already a passing e2e test before this phase; re-confirmed still passing.

## 3. Concurrent bookings (race conditions) — real gap, real fix

This is the one that deserved the most scrutiny. The existing test
(`REJECTS an overlapping window`) is **sequential** — request A completes,
*then* B is sent and checked against A's already-committed row. That proves
the "friendly pre-check" works, but not the thing the code's own comment
explicitly flags as the real concern: *"the pre-check can still race... 
optimistically INSERT, then re-query... deterministic on both sides, no
lock needed."* Sequential tests cannot prove that path holds.

Wrote a genuinely new test: two requests fired with `Promise.all` (not
awaited one after another) for the exact same overlapping window on a slot.
**First run found a real problem** — but it turned out to be a mistake in
how I ran the test in isolation (Jest's `-t` filter skipped the earlier
tests that set up the auth tokens this stateful suite depends on), not a
bug in the app. Running the full suite in order, the test passed
immediately: exactly one request gets `201`, the other `409`, and the
database ends up with exactly one live booking for that window — the
optimistic-insert-then-reconcile logic genuinely holds under a real race.

This did have one legitimate downstream effect: the new test leaves behind
a real, correctly-surviving booking, which bumped a later test's hardcoded
`totalBookings` count from 3 to 4. Fixed that assertion — not a bug, just
the natural consequence of this suite's deliberately sequential/cumulative
design, where every test's data persists for the ones after it.

## 4. Session timeout — verified already well-designed

Found a global 401 response interceptor in `utils/api.js` that clears the
stored session and redirects to `/login` — with a detail worth noting
because it's easy to get wrong: it explicitly **excludes the login
endpoint's own 401** from triggering this, so someone mistyping their
password isn't confusingly treated as "your session expired." Already
correct. No changes needed.

## 5. Network disconnection — already built (Phase 5.3)

The `OfflineBanner` component (persistent, not a dismissible toast) already
covers this. Nothing new needed this phase.

## 6. Invalid file uploads (too large / wrong type)

- **Too large**: already thoroughly covered — client-side compression
  targets a byte cap, server independently re-checks the same cap (verified
  in Phase 5.1).
- **Wrong type — a real, if low-severity, gap**: validation was purely
  `avatar.startsWith('data:image/')` — checking the data URL's own
  *declared* prefix, not its actual byte content. The browser-side
  compression pipeline can't produce a fake one (it requires successfully
  decoding real image data first), but nothing stops a direct API call
  (curl/Postman, bypassing the browser entirely) from sending a
  hand-crafted string claiming to be an image. Realistic severity is low —
  this app does no server-side image processing that malformed data could
  exploit, it's only ever stored as a string and re-embedded in an `<img
  src>` — but it's a real gap, cheaply closed. Added genuine magic-byte
  verification (`utils/validateImageBytes.js` — JPEG/PNG/WebP signatures,
  zero new dependencies), applied to both the avatar and station-photo
  upload paths. Tested directly with both a real JPEG-signature buffer
  (accepted) and plain text mislabeled as a JPEG (correctly rejected).

## 7. XSS and SQL injection

- **NoSQL injection** (Mongo's equivalent of SQL injection): confirmed zero
  raw MongoDB queries anywhere — everything goes through Prisma's typed
  query builder. Checked whether the classic operator-injection vector
  (`{"email": {"$ne": null}}` as a JSON body, exploiting the lack of
  compile-time typing in a `.js` backend) is actually blocked: yes —
  `express-validator`'s `.isEmail()` and `.trim()` both require string
  input internally on every auth route, which already rejects a
  non-string payload before it could reach Prisma.
- **XSS — a real, fixed gap.** React's JSX auto-escapes by default, and
  confirmed zero uses of `dangerouslySetInnerHTML` anywhere — the actual
  *website* is well-protected structurally. But `name` at registration is
  validated only with `.trim().notEmpty()` — no character restriction at
  all — and every transactional email (`utils/email.js`,
  `verification.service.js`) interpolates it straight into a raw HTML
  string. That's a different code path from React's rendering, and it does
  **not** auto-escape. A crafted name like `<script>...</script>` would
  land unescaped in an email sent to someone else (a station owner, an
  admin). Fixed with a tagged template literal (`utils/escapeHtml.js`) that
  auto-escapes every interpolated value while leaving the literal markup
  alone — applied to all 12 email templates (11 in `email.js` + the OTP
  template) as a one-word change per template, with one deliberate
  exception (a conditional "payment refunded" notice, which is our own
  fixed HTML, not user input — marked with `raw()` so it isn't
  double-escaped into visible text). Verified directly: a malicious name
  now renders as literal escaped text, not executable markup; the
  raw-marked exception still renders as real HTML.

## 8. CSRF protection — structurally non-applicable, verified rather than assumed

Checked how auth actually works before concluding anything: it's **purely
header-based** (`Authorization: Bearer <token>`, attached manually by the
frontend) — no cookies involved at all. CSRF specifically exploits browsers
*automatically* attaching credentials (cookies) to cross-site requests; a
malicious site cannot forge a custom header the way it can ride on a
cookie. This isn't "we forgot CSRF tokens" — it's an architecture where the
attack doesn't apply in the first place. No change needed, and adding a
CSRF-token mechanism here would be solving a problem this API doesn't have.

**Worth disclosing honestly, not silently accepting or silently changing**:
the JWT itself is stored in `localStorage` (confirmed) rather than an
httpOnly cookie — the standard trade-off here is that `localStorage` is
readable by any JS on the page, so *if* an XSS vector ever existed
anywhere in the app, token theft would be the consequence, whereas an
httpOnly cookie can't be read by JS at all (but then genuinely needs CSRF
protection, trading one risk for the other). Given React's structural
XSS resistance (confirmed above) and that this phase closed the one real
injection gap found, this is a reasonable, common trade-off as-is — but
it's a real architectural choice worth knowing about, not something to
gloss over.

---

## Verified

Re-ran the full e2e suite after every change this phase: **54/54 passing**
(up from 53 — the new concurrent-booking test is genuinely new coverage,
not a renamed existing one).
