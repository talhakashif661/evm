// Extracted from Register.jsx (which also uses this), where it previously
// lived alongside a page component — Vite's Fast Refresh only works
// cleanly when a file exports just components, so mixing a shared utility
// in with a page component meant editing Register.jsx during dev forced a
// full reload instead of a fast, state-preserving one. ResetPassword.jsx
// also uses this, which is the whole reason it needs to live somewhere
// both pages can import from, rather than in either page file.
//
// The scoring logic itself lives in utils/passwordStrength.js, not here —
// for the same Fast Refresh reason: this file needs to export only the
// component.
import { getPasswordStrength } from '../utils/passwordStrength';

export function PasswordStrengthBar({ password }) {
  const { score, label, color } = getPasswordStrength(password);
  if (!password) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            style={{
              height: 4,
              flex: 1,
              borderRadius: 2,
              background: i < score ? color : 'var(--border)',
              transition: 'background 0.2s',
            }}
          />
        ))}
      </div>
      <span style={{ fontSize: '0.72rem', color, fontWeight: 600 }}>{label}</span>
    </div>
  );
}
