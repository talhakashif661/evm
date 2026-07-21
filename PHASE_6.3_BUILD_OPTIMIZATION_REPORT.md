# Phase 6.3 — Build Optimization

## Worth saying upfront

`webpack-bundle-analyzer` is, specifically, a **Webpack** plugin — this
project builds with **Vite** (which uses Rollup under the hood for
production builds), a completely different bundler. That tool can't attach
to this build regardless of preference; it's not a stack-preference call
like the React Query/Redis decisions earlier in Phase 6 — it's simply the
wrong tool for what this project builds with. Implemented the real
equivalent for the bundler actually in use: `rollup-plugin-visualizer`,
which does the same job (an interactive treemap of what's taking up space)
for the Rollup ecosystem.

---

## 1, 2, 3 — already fully done, verified empirically (not assumed)

Rather than trust memory that Vite "does this by default," rebuilt from a
clean `dist/` and checked the actual output directly:

- **Minification**: confirmed by reading the built JS — genuinely
  minified (single-letter variables, no whitespace, condensed syntax). Real
  esbuild minification, working.
- **Asset hashing for cache busting**: confirmed every single file in
  `dist/assets/` carries an 8-character content hash
  (`AdminUsers-B77iuhEI.js`, etc.) — Vite's default, already correct.
- **Separate vendor chunks**: found this was already explicitly, deliberately
  configured in `vite.config.js` — `manualChunks` splits React/Router into
  a `vendor` chunk and Redux Toolkit/React-Redux into its own `redux` chunk,
  with a comment explaining the actual reasoning (vendor code changes far
  less often than app code, so splitting it means a deploy that only
  touches app code doesn't bust the browser's cache of the larger, more
  stable vendor bundle). This was already well done; nothing to add.

## 4. Bundle analysis — implemented, and gated correctly

Installed `rollup-plugin-visualizer` and wired it into `vite.config.js`,
generating `dist/bundle-analysis.html` — an interactive treemap of every
module in the bundle, sized by both gzip and brotli.

**One thing worth being careful about, and fixed before finalizing**:
`dist/` is what actually gets deployed — Vercel serves it as-is. An
unconditional analyzer would mean this internal dev artifact sits at
`yoursite.com/bundle-analysis.html` in production after every deploy. Gated
it behind an explicit opt-in instead: a new `npm run build:analyze` script
(using `cross-env` for cross-platform env-var syntax), while the normal
`npm run build` — what actually runs in CI/deploy — never generates it.
Verified **both** paths directly, not just one: ran a clean `npm run build`
and confirmed the file is genuinely absent, then ran `npm run
build:analyze` and confirmed it's genuinely present.

Documented the new script in `DEPLOYMENT.md`'s "Running Locally" section.

---

## Verified

- `npm run build` (default): confirmed `bundle-analysis.html` is **not**
  generated.
- `npm run build:analyze`: confirmed it **is** generated (1.1MB, valid HTML,
  correct Rollup Visualizer document structure).
- Both builds otherwise complete cleanly with the existing chunk structure
  intact (vendor/redux/per-route chunks all still present and correctly
  named/hashed).
