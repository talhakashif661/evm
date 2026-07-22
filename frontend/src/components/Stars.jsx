import PropTypes from 'prop-types';
import { Star } from 'lucide-react';

/**
 * Read-only star row with fractional fill (e.g. 4.3 shows 4.3 stars of gold).
 * Works by stacking a clipped gold row over a grey base row.
 */
export function Stars({ value = 0, size = 15, count = null }) {
  const pct = (Math.max(0, Math.min(5, value)) / 5) * 100;
  const row = (fill) => (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} size={size} fill={fill} color={fill} strokeWidth={0} />
      ))}
    </span>
  );
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ position: 'relative', display: 'inline-flex', lineHeight: 0 }}>
        {row('var(--star-empty)')}
        <span
          style={{
            position: 'absolute',
            inset: 0,
            width: `${pct}%`,
            overflow: 'hidden',
            whiteSpace: 'nowrap',
          }}
        >
          {row('var(--star-filled)')}
        </span>
      </span>
      {count !== null && (
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {count > 0 ? `${value.toFixed(1)} (${count})` : 'No reviews yet'}
        </span>
      )}
    </span>
  );
}

/** Clickable 1–5 star picker for the review form. */
export function StarInput({ value, onChange, size = 28 }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 2,
            lineHeight: 0,
          }}
        >
          <Star
            size={size}
            strokeWidth={1.5}
            fill={n <= value ? 'var(--star-filled)' : 'none'}
            color={n <= value ? 'var(--star-filled)' : 'var(--text-muted)'}
          />
        </button>
      ))}
    </div>
  );
}

Stars.propTypes = {
  value: PropTypes.number,
  size: PropTypes.number,
  count: PropTypes.number,
};

StarInput.propTypes = {
  value: PropTypes.number.isRequired,
  onChange: PropTypes.func.isRequired,
  size: PropTypes.number,
};
