# Phase 9.2 — Final Testing Instructions & Report

> ⚠️ **Read this before anything else in this doc.** One of the "IMPORTANT
> NOTES" attached to this phase directly conflicts with an established
> constraint from Phase 1 — see **§0** below. Nothing has been done about
> it; it's flagged, not acted on, pending your confirmation.

## §0 — A conflict that needs your decision first

The note said: *"Do NOT use any external CSS frameworks (like Tailwind or
Bootstrap) — use pure CSS or CSS Modules."*

This app is built on Bootstrap. It's not incidental — it's been the
explicit, hard-coded frontend stack since Phase 1 of this whole engagement
("React 18 + Vite + Redux Toolkit + **Bootstrap grid**"), it's imported
globally in `main.jsx`, its grid system underlies page layouts across all 26
pages, and Phase 5.4's whole mobile-responsiveness audit was specifically
about how *Bootstrap's* grid patterns stack (or don't) at small screens.

Removing it now would mean rewriting layout code across essentially the
entire frontend — which directly contradicts the *other* instruction in the
same note ("Maintain all existing functionality — don't break what already
works"). Those two notes can't both be followed literally at the same time.

**Nothing has been touched.** Bootstrap is still in place, and everything
below assumes it stays that way, matching every prior phase's tech-stack
constraint. If you did mean this literally — a full framework rip-out is a
legitimate thing to want, it's just a large, separate undertaking deserving
its own dedicated phase(s), not a line item inside final testing/deployment
prep. Let me know and I'll scope it properly rather than starting a
half-finished rewrite here.

---

## 1. Summary of all changes made

Full detail for every phase (1 through 9) lives in `CHANGELOG.md`, most
recent first. Condensed version of what changed in the phases this final
push touched:

**Phase 8.2 (Code Quality)** — ESLint (zero problems, both frontend/backend),
Prettier (config + full `--write` pass, all files clean), a console.log audit
(zero raw calls in frontend; two legitimate CLI-tooling exceptions in
backend), and a naming-conventions fix (`validate.js`/`validateQuery.js` →
`validate.middleware.js`/`validateQuery.middleware.js`, matching the other
three files in that folder).

**Phase 8.3 (Deployment Prep)** — a health check endpoint that runs a real
`SELECT 1` and returns 503 on DB failure (was a static always-200 stub);
confirmed the production API URL and `.env.example` groundwork was already
solid; added **Sentry** error tracking (frontend `@sentry/react` + backend
`@sentry/node`, wired into the existing `logger.js` hook point, no-ops until
you add a real DSN); added **Google Analytics 4** (hand-rolled, SPA-aware
page-view tracking, no-ops until you add a Measurement ID).

**Phase 9 (Final Verification)** — found and fixed a real bug: the actual
unfiltered `npm test` (not the `jest e2e.smoke` filter this engagement had
been using) failed on 3 of 5 suites. Fixed by mocking Prisma before import,
matching the pattern the other 2 files already used. `npm test` now
genuinely passes: **5/5 suites, 73/73 tests.**

**Also cleaned up along the way:** a batch of files that Prettier had
already reformatted in an earlier phase but never got committed to git —
purely whitespace/formatting, re-verified against `prettier --check` before
committing. Git history for this session is now 9 clean, logically-scoped
commits (see `git log`).

## 2. Issues encountered, and how they were fixed

| Issue | Root cause | Fix |
|---|---|---|
| Handoff doc said Prettier, console.log audit, and the health check endpoint were "not yet done" | They actually *were* done in an earlier session — just never logged in `CHANGELOG.md`, and (for the health check) never committed to git | Verified each directly against the running tools rather than trusting the doc; backfilled the CHANGELOG entries; committed the orphaned work |
| `backend/middleware/validate.js` / `validateQuery.js` didn't match the established naming pattern | Inconsistent naming from whenever they were first added | Renamed to `.middleware.js`, updated 6 route imports, re-verified tests |
| Adding Sentry bloated the frontend's main JS bundle by ~90 kB | `@sentry/react` landed in the default `index` chunk | Gave it its own Vite `manualChunks` entry — confirmed via rebuild that the main bundle is back to its original size |
| `npm test` failed on 3 of 5 suites (`Must use import to load ES Module`) | Those 3 files imported `app.js` / `bid.controller.js` directly instead of mocking `utils/prisma.js` first, so they transitively loaded the real `@prisma/client` — which can't initialize in this sandbox (missing query engine binary, see §5) | Applied the same `jest.unstable_mockModule` pattern the other 2 test files already used |
| A batch of controller/config files showed as modified in git but I hadn't touched them | Leftover uncommitted output from an earlier Prettier `--write` pass | Diffed each one to confirm formatting-only, then committed them as their own logical commit |
| `DEPLOYMENT.md` said "expected: 51/51 passing" | Stale — more test files were added over later phases | Updated to 73/73 (5 suites) |

## 3. Step-by-step instructions to run the project

```bash
# One-time setup — generates real .env files with random secrets for both
# folders (safer and faster than copying .env.example by hand):
node scripts/setup-env.mjs

# Then fill in backend/.env with your own:
#   DATABASE_URL       — your MongoDB / Atlas connection string
#   SENDGRID_API_KEY    — optional, leave empty to disable email
#   STRIPE_* keys        — only needed if PAYMENT_MODE="live"
#   SENTRY_DSN           — optional, leave empty to disable error tracking
# And frontend/.env with (both optional):
#   VITE_SENTRY_DSN
#   VITE_GA_MEASUREMENT_ID

# Terminal 1 — Backend
cd backend
npm install         # also runs `prisma generate`
npm start           # syncs the DB schema, then serves http://localhost:5000

# Terminal 2 — Frontend (includes Admin at /admin/*)
cd frontend
npm install
npm start           # http://localhost:3000
```

**Run the test suite** (no database or `.env` needed — fully mocked):
```bash
cd backend && npm test      # expected: 73/73 passing, 5 suites
```

Full deployment guide (Vercel + Render, env var reference, troubleshooting)
is in `DEPLOYMENT.md`.

## 4. Screenshots

No live browser is available in this sandbox (documented since this
engagement's original handoff — `cdn.playwright.dev` is blocked, confirmed
by directly attempting a Playwright install). What's below are the same
**PIL-generated mockups from Phase 8.1**, built from this app's actual theme
CSS variables and explicitly labeled as mockups, not real screenshots —
they already cover everything asked for here:

![Hero section](docs/screenshots/hero-mockup.png)
![Components — buttons, cards, badges, form fields, navbar](docs/screenshots/components-mockup.png)

Swap these for real screenshots once you can run the app in an actual
browser — they'll look better than these anyway.

## 5. Remaining issues or warnings

- **Backend won't start in *this* sandbox specifically.** `new PrismaClient()`
  throws synchronously because its query engine binary never downloaded
  (`binaries.prisma.sh` is blocked here). `prisma/schema.prisma`'s generator
  config is completely standard, so this is expected to start cleanly
  anywhere with normal internet access (confirm this yourself before
  considering deployment fully verified — this is the single most important
  thing in this list to double-check).
- **Optional Dockerfile** (8.3 checklist) — not built. Vercel/Render don't
  need it, so only worth doing if you want container portability elsewhere.
- **DRY pass + component extraction** (8.2 checklist) — the most
  open-ended item left; hasn't had its own dedicated pass yet.
- **A handful of components hardcode their own hex colors** (star ratings,
  status badges in `Stars.jsx`, `Stations.jsx`, `Navbar.jsx`, and others)
  instead of the shared CSS variables. Not necessarily wrong, but worth a
  look if full palette centralization matters to you.
- **Pre-existing `esbuild`/`vite` vulnerability** (frontend, moderate/high) —
  already known from Phase 6; fixing it needs a major Vite version bump,
  deliberately left out of scope again here.
- **Can't verify without a live browser:** actual console errors, true
  click-through 404 testing, and whether the hero section "looks
  professional" are all things I can't see for myself in this sandbox.
  Mobile responsiveness is still only Phase 5.4's code-level audit — no live
  viewport testing has been possible at any point in this engagement.

## 6. Recommendations for future improvements

1. **Verify backend startup on a machine with real internet access** —
   this is the one item in this whole report that genuinely can't be
   confirmed here at all (see §5).
2. Finish the **DRY pass / component extraction** — the last open item from
   8.2, and the most likely place left to find real duplication.
3. Consider centralizing the hardcoded accent hex colors into CSS variables
   for full palette consistency.
4. Once deployed, do a real pass with actual DevTools open — console
   errors, real 404s, and visual polish are the three things this
   engagement has never once been able to check directly.
5. If a Bootstrap-free rewrite is genuinely wanted (see §0), scope it as
   its own phase — it's a large, cross-cutting change that deserves
   dedicated planning rather than being folded into deployment prep.
6. Consider the Vite major-version bump to clear the pre-existing
   `esbuild` advisory, on its own schedule since it's a breaking change.
