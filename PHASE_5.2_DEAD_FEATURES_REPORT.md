# Phase 5.2 — Find and Fix Dead Features

**Method:** systematic cross-referencing, not spot-checks — every component
file checked for actual usage, every registered route checked for a real
navigational path to reach it, every backend endpoint checked against every
frontend API call, every modal checked for both an open trigger and a close
mechanism. Where my first pass gave a false positive (see below), I caught
it by checking the real code rather than trusting the grep.

---

## 1. Routes/components imported but never used — clean, none found

Checked all 13 files in `components/`: every one is genuinely imported and
used elsewhere (SEO: 27 usages, Spinner: 11, Skeleton: 7, Stars: 3, the rest
1–2 each, all real). No dead component files.

**Route reachability** — my first pass wrongly flagged `/ai-recommend`,
`/auction`, `/history`, `/payments`, and all six `/admin/*` routes as
possibly unreachable, because my grep only caught literal `to="/path"`
strings. Those routes are actually linked from **data-driven arrays**
(`Navbar.jsx`'s role-based `userLinks`/`ownerLinks`/`adminLinks`,
`AdminLayout.jsx`'s `navItems`, and a Dashboard quick-action tile for
`/ai-recommend`) — a completely normal, common pattern my first check
couldn't see. Verified each one directly. **Every registered route has a
real way to reach it** — nav link, quick-action tile, an intentional
redirect shim (`/owner/slots`, `/owner/bookings` → `/owner/station`), or an
expected external entry point (`/reset-password` arrives via an emailed
token link, not an in-app click, which is correct).

## 2. API endpoints with no frontend integration — found 2 real ones

Enumerated all 61 backend endpoints, cross-referenced against every
`api.*()` call in the frontend. 59 are used. Two are not — and one
intentional non-use worth naming so it isn't mistaken for a gap:

- **`POST /auth/setup-admin`** — correctly has *no* frontend call. This is
  by design (Postman-only bootstrap, documented in `DEPLOYMENT.md`). Not a
  gap.
- **`GET /payments/status/:transactionId`** — a real, correctly-implemented,
  properly-access-scoped endpoint (looks up a payment by Stripe
  PaymentIntent id, scoped to the requester unless admin) with **zero**
  frontend references anywhere. Likely a natural REST counterpart to
  "create a payment intent" that the app ended up not needing, since the
  actual payment-status flow is delivered via Socket.IO (`payment:failed`)
  and the payment history list instead. Harmless as-is — I didn't remove
  it, since deleting working, correctly-secured backend code because the
  current UI doesn't call it felt like a bigger, less reversible call than
  what this pass should make unilaterally. **Your call**: leave it
  documented as a support/debugging utility endpoint, wire up a small
  "look up a transaction" UI somewhere, or remove it as dead code.
- **Admin review moderation — a real gap, not just an unused endpoint.**
  `deleteReview` on the backend explicitly branches on `isAdmin` and writes
  a dedicated audit-log message ("Moderated a X★ review...") — this was
  clearly built with admin moderation in mind. But the frontend **only ever
  calls this for the review's own author** (`myReview.id` in
  `StationDetail.jsx`); there's no admin page anywhere to browse or moderate
  reviews, and there isn't even a backend endpoint to list reviews
  platform-wide (only per-station). This is bigger than "wire up an
  existing button" — it'd need a new paginated admin-list endpoint *and* a
  new admin page (the other 6 admin pages give a clear pattern to follow).
  I flagged this rather than build a new admin panel unasked — say the word
  if you want it built.

## 3. "View Details" links — only one instance exists, confirmed working

Searched the whole app: `View Details` appears in exactly one place
(`Stations.jsx` → `/stations/:id`), which was already confirmed working in
the Phase 3.1 audit (route registered, link correctly formed). Nothing else
to check here.

## 4. Navigation paths — clean

Cross-checked every navigation target found (literal `to="..."` strings,
`navigate()` calls, and the data-driven arrays from item 1) against the
registered route list. Every target matches a real route — no typo'd paths,
no dangling links to routes that don't exist (the class of bug the original
`/stations/:id` registration issue from the prior engagement was).

## 5. Modals open and close — all 12 fully verified

Found every `<Modal>` and `<PaymentModal>` usage (12 total across
`OwnerDashboard`, `MyEVs`, `Bookings`, `StationDetail`). For each, checked
**both halves**: a real trigger that sets the controlling state to
true/non-null (a button `onClick`), and a real way to close it (explicit
`onClose`, plus most also close themselves on a successful submit). All 12
have both. None found with an open button but no close, or vice versa.

---

## Summary

Items 1, 3, 4, and 5 came back clean — I want to be upfront that "clean"
here doesn't mean I went easy on the check; the route-reachability
false-positive above shows the checking was genuinely adversarial, it's
just that this codebase didn't have much dead weight left after the prior
phases. Item 2 turned up two real, worth-knowing-about findings: one
harmless orphaned endpoint, and one real feature gap (admin review
moderation) that's implemented on the backend but has no way to reach it
from the UI. Neither needed a code fix today — both are decisions for you,
not bugs to silently patch.
