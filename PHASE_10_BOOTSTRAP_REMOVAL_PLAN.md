# Phase 10 — Remove Bootstrap (Scoping Plan)

Scoped, not executed beyond the one low-risk foundational piece noted in
§4. This is a fundamentally different kind of phase from everything before
it in this engagement — see §3 before deciding how to proceed.

## 1. Measured scope

Counted directly against the frontend source, not estimated:

- **34 of 43** frontend `.jsx` files reference a Bootstrap-ish class.
- **334** total className occurrences involved, breaking down as:
  | Category | Count | Examples actually used |
  |---|---|---|
  | Grid | 104 | `container`, `row`, `col-6`, `col-12`, `col-sm-6`, `col-md-2/3/4/5/6`, `col-lg-3/4/5/7`, `g-3`, `g-4` |
  | Form controls | 111 | `form-control`, `form-select`, `form-check`, `form-label` |
  | Spacing/layout utilities | 55 | `mb-3`, `mb-4`, `mt-2`, `w-100`, `align-items-center` |
  | Raw component classes | 22 | `badge`, `alert`, `spinner-border`, `table`, `dropdown-menu` |
- **Zero** existing CSS Modules usage (`*.module.css`) — this would be a
  new pattern, though Vite supports it natively with no config needed.
- **One** global stylesheet today (`index.css`, 1030 lines).
- **227 KB** minified — the actual size of `bootstrap.min.css` currently
  shipped in full (no purging/tree-shaking on a static CSS import like
  this), regardless of how much of it is actually used.
- No `react-bootstrap` / `reactstrap` — this is raw Bootstrap CSS applied
  via `className` strings only, not a JS component library. That makes
  this a CSS-and-JSX-className migration, not an import-swapping one.

## 2. The good news this scope search turned up

This is more tractable than "rebuild all of Bootstrap" sounds:

- **Buttons, cards, navbar, hero, and footer are already custom CSS**
  (`.btn-gold`, `.btn-primary`, `.ev-card`, `.navbar-root`, `.hero-v2`,
  `.site-footer`, etc.) layered on top of Bootstrap, from Phase 2's
  rebrand. Bootstrap isn't providing their visual identity today — mostly
  just structural/reset behavior underneath.
- **Forms already have real overrides too** — `.form-label`,
  `.form-control` (+ `:focus`, `::placeholder`), `.form-select` (+
  `:focus`) are all already custom in `index.css`. The biggest single
  category (111 occurrences) is lower-risk than its size suggests.
- **The grid usage is a small, fixed set** — not all 6 breakpoints × 12
  columns, just 3 breakpoints and a handful of specific widths (see table
  above). That's a well-defined, deterministic thing to replicate — grid
  math isn't a matter of visual taste.

## 3. The one real risk, and why it's different from every prior phase

Every phase before this one had something objective to check against:
ESLint for code quality, Jest for behavior, `prettier --check` for
formatting, a real HTTP request for the health endpoint. **This phase
doesn't have that.** The test suite exercises backend API behavior only —
it has no opinion on whether a page's layout looks right. There is no live
browser in this sandbox (unchanged since this engagement's very first
handoff), so nothing about how a migrated page actually *renders* can be
confirmed here — not by me, not by any tool available in this session.

Concretely, that means: the grid/utility replacement in §4 is *math*, and
I'm confident in it the same way I was confident that
`0.75 * 100 / 3 = 25`. The 22 raw Bootstrap component classes (badge,
alert, spinner, table, dropdown) and `form-check` (checkboxes/radios)
are *not* math — they currently render using Bootstrap's own opinionated
default styling with no override in this codebase, so migrating them means
making new visual decisions, not just replicating existing ones. That's
exactly the part I can't verify blindly.

**Recommendation:** don't let this phase run to completion inside this
sandbox alone. A visual sign-off step from you (or a session with real
browser access — Claude in Chrome, or your own `npm run dev`) belongs
between each stage below, especially before the higher-risk category ships.

## 4. What's actually done so far (low-risk only)

`frontend/src/styles/grid.css` — a custom grid + utility layer covering
*exactly* the tokens measured in §1's grid/utility rows, nothing more.
Purely additive: not imported anywhere yet, doesn't touch any existing
page, doesn't remove the Bootstrap import. Breakpoints (576/768/992px)
and the spacing scale intentionally match Bootstrap's own values —
not out of deference to Bootstrap, but because this app's current
responsive behavior was tuned against those specific numbers, and
changing them would itself be a functionality change.

## 5. Proposed phases from here

1. **Pilot one page.** Pick something low-traffic (e.g. `About` or
   `Contact`), wire in `grid.css`, swap its Bootstrap classNames for the
   new ones, remove nothing yet (Bootstrap's CSS stays imported as a
   safety net for every other page). You visually check it against the
   current version before anything else proceeds.
2. **Design the higher-risk pieces deliberately** — badges, alerts,
   spinners, tables, dropdowns, and checkbox/radio styling, as their own
   small design pass (matching the cream/gold/dark palette), not
   mechanical replication, since there's nothing faithful to replicate
   them *from*.
3. **Migrate the remaining 33 files in batches**, each batch checked with
   `npm run build` + `npx eslint .` + a visual spot-check, not just the
   first two.
4. **Remove Bootstrap** — drop the `bootstrap` npm dependency and its CSS
   import from `main.jsx` — only once every file is confirmed migrated.
5. **Final full verification** — full test suite, build, lint, and a
   real look at the whole app, the same bar Phase 9 used for everything
   else.

## 6. What this phase will *not* do

Touch any of the 34 existing page/component files. That's deliberate —
every one of those changes is exactly the category this plan flags as
unverifiable from inside this sandbox. They're staged as the next step,
not this one.
