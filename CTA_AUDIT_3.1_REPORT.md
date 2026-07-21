# Phase 3.1 — CTA Audit

**Method:** read the actual JSX for every page named below (not assumed from
the checklist) and cross-checked against routes in `App.jsx`. Touch-target
sizes are evaluated against the 44px minimum your own Phase 3.2 brief
specifies. No code was changed in this pass — 3.1 is audit-only; fixes belong
to 3.2/3.3, which this feeds directly into.

---

## Landing Page — ✅ matches, already fixed in Phase 2.3
| CTA | Status |
|---|---|
| "Find Stations" | ✅ exact match, `.btn-primary`, dark/cream |
| "List Your Station" | ✅ exact match, `.btn-outline` |

## Stations Page → Station Detail — ✅ present, route confirmed working
| CTA | File | Finding |
|---|---|---|
| "View Details" | `Stations.jsx` | ✅ exact match. Routes to `/stations/:id`, which **is** registered in `App.jsx` (confirmed — the Phase-1 route-registration bug stayed fixed). Styled `.btn-outline-gold`, full-width on the card. |
| "Book Now" | `StationDetail.jsx` | ✅ exact match, `.btn-gold` (correctly the *solid* primary style, since committing to book is the higher-stakes action vs. browsing). Only shown for `AVAILABLE`/`RESERVED` slots — a "Sign in to book" variant covers logged-out users. |

## Dashboard — ⚠️ partial match
| Checklist says | What's actually there |
|---|---|
| "Find New Station" | Close but not exact: a quick-action card labeled **"Find Stations"** → `/stations`. (Also a duplicate "Find Stations" button in the Recent Bookings empty state.) Minor wording gap, not a functional one. |
| "View My Bookings" | **Not this label.** It's a small plain-text link that just says **"View all"** (next to the "Recent Bookings" heading) → `/bookings`. It works, but it's unbranded, generic, and isn't styled as a button at all — no `.btn-*` class, no padding box, just text + a small arrow icon. |

Also present but not in the checklist: "Add EV" (empty state), "Manage" (EVs, text link), and an "Auction Hub" quick-action card (see below), plus owner-view "Manage Station" / "Register Station".

## Profile Page — ⚠️ one label mismatch
| Checklist says | What's actually there |
|---|---|
| "Save Changes" | ✅ exact match, `.btn-gold`, and genuinely good UX — button disables and shows "Saving..." during submit. |
| "Change Password" | **That's the section heading (`h3`), not the button.** The actual submit button says **"Update Password"**. Arguably better copy (more precise verb), but it doesn't match what the checklist expected to find. |

## Auction Hub — ⚠️ one CTA doesn't exist anywhere
| Checklist says | What's actually there |
|---|---|
| "Place Bid" | ✅ exact match, per live-auction slot card, `.btn-outline-gold`. |
| "View Active Auctions" | **This exact CTA does not exist anywhere in the app.** `AuctionHub.jsx` is a single page with three tabs (Live Auctions / My Bids / Results); "Live Auctions" is simply the **default tab** shown on arrival — so the *intent* is met (you land on active auctions), but there's no button anywhere, on this page or the Dashboard, actually labeled "View Active Auctions". The closest thing is the Dashboard's **"Auction Hub"** quick-action card, which is different wording and a different destination context (a nav card, not a page-level CTA). |

---

## Pattern found across pages: inconsistent, shrinking touch targets

None of the button classes (`.btn-gold`/`.btn-primary`, `.btn-outline`/`.btn-outline-gold`) have an explicit `min-height` — their height is whatever padding + font line-box happens to produce, which is exactly the kind of thing your 3.2 brief calls out ("minimum 44px height for touch targets"). That alone is worth fixing in 3.2. But several specific call sites make it worse by **overriding the base padding down further**, so sizing is inconsistent CTA-to-CTA, not just uniformly tight:

| CTA | Base class padding | Inline override |
|---|---|---|
| Profile "Save Changes" / "Update Password" | 11px / 10px | `10px 28px` — close to base, fine |
| Stations "View Details" | 11px / 10px | `10px` (both axes — horizontal also shrunk, though `width:100%` compensates) |
| Dashboard quick-action buttons | 11px / 10px | `8px 20px` |
| StationDetail "Book Now" | 11px | `8px` (uniform) |
| AuctionHub "Place Bid" | 10px | `7px` — the smallest in the app |

I can't render the app to measure exact pixels here, so I'm not going to assert a false-precision number — but "no guaranteed minimum, and several sites shrink it further" is a verifiable fact from the code, and it's the natural first fix in 3.2 (an explicit `min-height: 44px` on the shared button classes would fix all of these at once, everywhere, rather than needing per-button padding tweaks).

## Icon consistency
"View Details" and "Place Bid" already have an arrow icon; "Book Now", "Save Changes", and "Update Password" don't. Not wrong, just inconsistent — 3.2 asks for icons on CTAs, so worth deciding a rule (e.g., icon on navigational/forward-moving actions, no icon on form-submit actions) rather than adding them everywhere uniformly.

---

## Summary for 3.2/3.3 planning
1. **Fix touch targets app-wide** by adding `min-height: 44px` to the shared button classes (one change, fixes every CTA at once) rather than patching each inline override individually.
2. **Dashboard**: promote "View all" (Recent Bookings) to a real button, and decide on final copy ("View My Bookings" vs. keep "View all").
3. **Auction Hub**: decide whether "View Active Auctions" needs to exist as its own CTA somewhere, or whether the Dashboard's "Auction Hub" card + Live-Auctions-as-default-tab already satisfies the intent.
4. **Profile**: cosmetic only — "Update Password" vs. "Change Password" — likely fine as-is, flagging for awareness not because it's wrong.
