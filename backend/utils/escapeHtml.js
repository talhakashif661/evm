// Prevents stored-XSS-via-email: registration/station names are
// user-controlled (validators/authValidators.js only checks
// .trim().notEmpty() — no character restriction), and every email template
// in utils/email.js and services/verification.service.js interpolates them
// straight into an HTML string. That's a different code path from the
// frontend's React rendering (which auto-escapes by default) — raw
// JS template-literal interpolation does not, so a name like
// "<script>...</script>" would land in the HTML unescaped in an email sent
// to someone else (a station owner, an admin) whether or not the sending
// user was ever authenticated with a script tag as their real name.
//
// `html` is a tagged template literal: every interpolated ${value} is
// escaped automatically, while the literal template text (the markup we
// wrote ourselves) is left untouched — so fixing every call site is a
// one-word change (prefixing the template with `html`), not manually
// wrapping every individual interpolation.
export function escapeHtml(value) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value ?? '').replace(/[&<>"']/g, (c) => map[c]);
}

// A few templates conditionally interpolate a small chunk of HTML *we*
// wrote (not user input) — e.g. a fixed "payment refunded" notice shown
// only if a flag is true. Wrapping those specific literals in raw(...)
// marks them as already-safe, so the tag function passes them through
// instead of escaping our own markup into visible text.
class SafeHtml { constructor(value) { this.value = value; } }
export const raw = (value) => new SafeHtml(value);

export function html(strings, ...values) {
  return strings.reduce((result, str, i) => {
    if (i >= values.length) return result + str;
    const v = values[i];
    const rendered = v instanceof SafeHtml ? v.value : escapeHtml(v);
    return result + str + rendered;
  }, '');
}
