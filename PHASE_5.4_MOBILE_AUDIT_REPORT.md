# Phase 5.4 — Mobile Responsiveness Audit

**Methodology, stated plainly:** I don't have a live browser in this
environment — I can't literally resize a viewport and watch things break.
What this audit actually is: a rigorous **code-level** read of every CSS
rule, Bootstrap grid usage, and fixed-width value that determines layout
behavior at each breakpoint, reasoned through against well-documented CSS/
Bootstrap/mobile-browser behavior. Where I found something with a known,
specific, checkable failure mode (not a vague guess), I fixed it. I'm not
going to claim I "tested in a browser" when I didn't — this is auditing the
inputs that determine the output, which is a real and useful check, just a
different kind of evidence than a screenshot.

---

## Real, concrete bugs found and fixed

### 1. Every form input triggers iOS Safari's auto-zoom (font-size bug)
`.form-control` and `.form-select` were `font-size: 0.95rem` — at this app's
16px base, that's **15.2px**. This crosses a very specific, well-known
threshold: iOS Safari automatically zooms the viewport when a text input
under 16px receives focus, because it assumes the text is too small to
read. This affected **every single form in the app** — login, register,
profile, station registration, booking/bid/review modals, all of it.
Fixed: both bumped to `1rem` (16px exactly). This is exactly what the
"font sizes are readable (16px minimum)" line item is checking for.

### 2. Modals were nowhere near "full-screen on mobile"
Did the actual math: 20px of overlay padding + the modal's own 32px padding,
on a 320px phone, left about **216px** of real content width — cramped, and
nothing like full-screen. Added a mobile breakpoint (via a new `modal-panel`
class, since the component only had inline styles before) that switches to
a bottom-sheet: anchored to the bottom edge, full width, rounded only on
top, tighter padding. This is one shared `Modal` component, so the fix
covers all 13 modal instances across the app at once (confirmed
`PaymentModal` wraps the same component).

### 3. Two hardcoded 2-column grids that never stack
`Register.jsx` (First/Last Name) and `Contact.jsx` (Name/Email) both used a
raw `gridTemplateColumns: '1fr 1fr'` — unlike the `auto-fit`/`minmax` grids
used elsewhere in the app (which **are** genuinely responsive and collapse
correctly on their own), a hardcoded `1fr 1fr` never changes regardless of
viewport width. Added a shared `.form-grid-2col` class that stacks to one
column under 480px, applied to both.

### 4. Bootstrap `col-6` (bare, no breakpoint prefix) on form field pairs
Found in `OwnerDashboard.jsx` (City/Price, Latitude/Longitude — ×2 for the
create and edit forms) and `MyEVs.jsx` (Battery Capacity/Current Level).
Bootstrap's `col-6` with no breakpoint infix means "50% width at every
screen size, including the smallest phone" — it doesn't collapse on its
own. Changed all 10 instances to `col-12 col-sm-6`, so these genuinely
stack full-width below Bootstrap's `sm` breakpoint (~576px) and pair up
efficiently above it.

**Important nuance — I did not treat every `col-6` as a bug.** Several
`col-6 col-md-3` usages are `StatCard` tiles (Dashboard, OwnerDashboard, and
similar) — short label + number + icon. Two-per-row on even a 320px phone
is a deliberate, common, *good* mobile-dashboard pattern (this is how most
well-designed mobile stat displays work), not cramped content that needs
fixing. Same for Footer's two `col-6 col-md-2` link-list columns — short
stacked link text, genuinely fine at half-width. I checked the actual
content inside each `col-6` before deciding, rather than mechanically
flagging every instance of the class name.

---

## Checked and confirmed already correct (no changes made)

- **Tables** — all 8 `<table>` instances across the app (4 admin pages,
  OwnerDashboard, UserHistory, Payments, StationReport) are already wrapped
  in `overflowX: 'auto'` containers. Clean.
- **Cards stacking** — audited every Bootstrap grid column class used
  anywhere in the app; every genuine card-grid usage starts from `col-12`
  as its mobile base (confirmed via a full grep sweep, not a sample).
- **Buttons touch-friendly (44px)** — this was already fixed app-wide in
  Phase 3.2 (`min-height: 44px` on the shared button classes); re-confirmed
  it's still intact and wasn't accidentally reverted by anything since.
- **Navbar collapse** — hamburger + slide-down panel already exists (Phase
  2.1), triggers at 860px. Checked the mobile panel's own CSS specifically
  for this audit: `font-size: 1rem` (16px, readable) and enough padding to
  give roughly a 51px touch target per link — both already correct.
- **Hero scaling** — `.hero-v2`'s mobile breakpoint (built in Phase 2.3)
  already handles stacking/centering/illustration sizing correctly.
- **Large desktop (1440px+)** — `.page-container` caps at `max-width:
  1200px` and centers, so content doesn't stretch awkwardly wide on large
  monitors. Pages using a custom narrower max-width (960/900/680px) do so
  deliberately for reading-width content, not as a bug.
- **No horizontal scroll** — swept for hardcoded fixed pixel widths and
  oversized `minWidth` values across every page; found none that would
  force page-level overflow. The one fixed-width value found (a 160px photo
  thumbnail in Station Detail's gallery) is inside a deliberately
  horizontal-scrolling photo carousel — a scoped, intentional scroll area,
  not the whole-page overflow this check is actually about.
- **Filter/search bars** — Stations' filter row already has `flexWrap:
  'wrap'` on both the outer container and the search form, so controls
  wrap onto multiple lines instead of overflowing on narrow screens.

## What I could not verify (disclosed, not glossed over)

Anything that depends on actual rendering — real font metrics, exact
wrapping points, how a specific phone's browser chrome affects available
viewport height, whether an animation feels janky at 320px — needs a real
device or at minimum a browser dev-tools session, which I don't have here.
If you (or your team) run this through Chrome DevTools' device toolbar or
a real phone, I'd treat that as the actual confirmation this audit couldn't
provide, not a redundant extra step.

---

## Verified

`npm run build` passes after every change in this phase, checked
incrementally rather than only at the end.
