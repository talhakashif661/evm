# Phase 7.3 — Accessibility Testing

**Method:** real, verifiable evidence for each item — computed WCAG contrast
math (not eyeballed), full-app greps (not samples), and direct source
inspection of the icon library's actual rendering behavior. Two systemic
gaps found and fully fixed across the whole app; several items already in
genuinely good shape, confirmed rather than assumed.

---

## Color contrast (WCAG 2.1 AA) — computed, not estimated

I don't have a browser to screenshot rendered contrast, but WCAG contrast is
a precise mathematical formula (relative luminance) — implemented it
directly and ran every key color pair in the actual palette through it.

**Real failures found and fixed** (all three are base CSS variables, so
each fix applies everywhere that color is used, all at once):
- `--warning` (`#D4A02B` → `#7F6019`): was **1.88:1** against its own badge
  background — failing badly, not marginally. Also reused as direct text
  color in ~25 places beyond badges (stat values, table cells, prices), so
  this was a base-variable fix, not a badge-only patch. New value verified
  ≥4.5:1 against every background it's actually used on: cream page bg
  (5.53:1), white cards (5.85:1), its own badge tint (4.64:1).
- `--info` (`#3B82F6` → `#295BAC`): same story, **2.91:1** against its badge
  background. New value verified 6.23/6.59/5.22:1 across the same contexts.
- `--text-muted` (`#8A8A8A` → `#6E6E6E`): **3.27:1** against the cream page
  background — this variable is used for small captions/labels app-wide,
  not large text, so it needed the full 4.5:1, not the relaxed 3:1 large-text
  threshold. New value: 4.82:1.
- A scoped fix (not a variable change) for the Landing hero's small kicker
  chip, which used `--accent-gold-dark` at 13px: that variable is also used
  correctly elsewhere for large text (an `<h1>` word, which only needs
  3:1 and passes), so changing it globally would've been the wrong fix —
  used a dedicated darker shade (`#7E663A`, verified 4.70:1) just for that
  one small-text context instead.

**Verified already passing, no changes needed**: `text-primary`/
`text-secondary` on the page background (16.46:1 / 8.38:1), cream text and
gold accents on the dark navbar, cream button text on dark buttons,
`badge-success`/`badge-danger`/`badge-gold` against their own backgrounds
(all comfortably ≥4.5:1).

## Focus management

- **Verified already correct, corrected my own initial assumption**: I
  first suspected `.form-control`/`.form-select`'s `outline: none` meant no
  visible focus indicator — but there's already a global
  `input/button/select/textarea/a:focus-visible { outline: 2px solid... }`
  rule, and CSS specificity (element + pseudo-class beats a single class)
  means it correctly overrides the `outline: none` regardless of source
  order. Already using the modern `:focus-visible` (not blanket `:focus`)
  pattern correctly — shows the ring for keyboard nav, not for mouse clicks.
  Nothing needed fixing here; I checked before assuming.
- **A real, substantial gap, now fixed**: the shared `Modal` component (used
  by all 13 modal instances app-wide) had **no focus management at all** —
  focus didn't move into the dialog on open, wasn't trapped inside it, and
  didn't return anywhere on close. Fixed all three: focus now moves to the
  dialog when it opens, Tab/Shift+Tab cycle within it while open (a basic
  focus trap), and focus returns to whatever triggered the modal when it
  closes.

## Keyboard navigation

- Swept the whole app for `onClick` on non-interactive elements (a `<div>`
  or `<span>` acting like a button, which isn't reachable via Tab or
  triggerable by Enter/Space by default): found exactly **one**, in the
  shared `Modal` — the backdrop-click-to-dismiss. Checked it rather than
  flagging it reflexively: this is a legitimate pattern, since a keyboard
  user has Escape (now added, see below) and the modal's own close button,
  not an expectation to "Tab to the backdrop."
- **Escape-to-close was completely missing from the Modal** — fixed as
  part of the same rebuild above. Every modal in the app now closes on
  Escape.

## ARIA attributes

Also part of the Modal rebuild: added `role="dialog"`, `aria-modal="true"`,
and `aria-labelledby` pointing at the dialog's own title (using React's
`useId()` for a collision-safe id) — none of this existed before. Also
replaced the close button's bare, unlabeled "×" character with a real
`aria-label="Close dialog"` and a proper icon.

## Screen reader compatibility

- The Modal fixes above are the biggest lever here — a screen reader user
  now gets an actual "dialog" announcement with the right title, instead of
  silently not knowing anything opened.
- **Checked decorative icons rather than assuming they need `aria-hidden`**:
  read lucide-react's actual source (`defaultAttributes.js`) — its icons
  render as bare `<svg>` with no `role`, no `aria-label`, no `<title>`
  child, so they have no accessible name by default and aren't actively
  causing loud/confusing announcements in most modern screen readers. Given
  that, and the sheer number of icon usages app-wide, I didn't do an
  exhaustive icon-by-icon `aria-hidden` pass — the marginal benefit is real
  but small, and I'd rather report this honestly than claim a bigger fix
  than the evidence supports.

## Alt text on all images

Re-swept the whole app: still clean, same result as Phases 1.2 and 4.3 —
all 6 `<img>` tags have appropriate alt text (empty for avatars sitting
next to a visible name, which is the WCAG-correct choice; descriptive for
real content photos). No regressions since those earlier passes.

## Form labels properly associated — the other systemic gap

**58 labels across 11 files, zero had `htmlFor`.** Visually every label sat
right next to its input, but none were programmatically connected — a
screen reader would announce "edit text" with no indication of what it's
for, and clicking the label text wouldn't focus the input either.

Fixed all 58, but not mechanically — checked each one's actual context:
- **52** are plain inputs/selects/textareas — straightforward `id`/`htmlFor`
  pairs, unique per page (`register-firstName`, `login-email`, etc.).
- **5** actually label a *group* of controls, not one — `AmenitiesPicker`
  (a checkbox group), `ImagesPicker` (an upload widget), and `StarInput`
  (5 individual star buttons). A `htmlFor` doesn't fit a group; converted
  these to `<fieldset><legend>`, the semantically correct pattern, styled
  to look visually identical to before.
- **1** needed no change at all — the avatar-upload label already wraps its
  `<input type="file">` directly, which is already correctly, implicitly
  associated by nesting per the HTML spec.
- `AddressAutocomplete` (a custom component used twice, for station
  creation and editing) needed a small update to actually accept and
  forward an `id` prop to its internal input.

---

## Verified

`npm run build` passes after every change across all three turns of this
phase. Final full-app sweep: zero remaining `<label className="form-label">`
without either `htmlFor` or a `fieldset`/`legend` conversion.
