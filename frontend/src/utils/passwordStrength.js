// Split out from components/PasswordStrengthBar.jsx so that file can be a
// pure component (needed for Vite's Fast Refresh, which only works cleanly
// when a file exports just components — mixing this scoring function in
// with the component was flagging the same warning this was originally
// extracted from Register.jsx to fix).
//
// Simple, transparent heuristic (length + character variety) — not trying
// to be a full entropy calculator, just enough to nudge people away from
// "123456".
export function getPasswordStrength(password) {
  if (!password) return { score: 0, label: '', color: 'var(--border)' };
  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 10) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  const levels = [
    { label: 'Too short', color: 'var(--error)' },
    { label: 'Weak', color: 'var(--error)' },
    { label: 'Fair', color: 'var(--warning)' },
    { label: 'Good', color: 'var(--accent-gold-dark)' },
    { label: 'Strong', color: 'var(--success)' },
    { label: 'Strong', color: 'var(--success)' },
  ];
  return { score, ...levels[score] };
}
