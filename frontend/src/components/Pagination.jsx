import PropTypes from 'prop-types';

/**
 * Page-number control shared by the station grid, booking history and the
 * owner's revenue table.
 *
 * Those three had grown their own near-identical copies of this markup,
 * differing only in button size and whether they sat inside a table footer
 * — which is why `variant` exists rather than a pile of style props. Two
 * genuine layouts, named after where they're used:
 *
 *   table      — sits under a table body, so it carries the divider rule and
 *                the cell padding that lines it up with the rows above.
 *   standalone — floats below a card grid with its own top margin.
 *
 * The copies were also all missing the same accessibility bits: no landmark,
 * no indication of which page is current beyond colour, and no accessible
 * name on the buttons ("3" alone tells a screen-reader user nothing). All
 * three are fixed here once.
 */
export default function Pagination({ page, totalPages, onChange, variant = 'table' }) {
  if (!totalPages || totalPages <= 1) return null;

  const isTable = variant === 'table';

  const wrapper = isTable
    ? {
        padding: '16px 24px',
        borderTop: '1px solid var(--border)',
      }
    : { marginTop: 40 };

  const size = isTable ? 36 : 40;

  return (
    <nav
      aria-label="Pagination"
      style={{ display: 'flex', justifyContent: 'center', gap: 8, ...wrapper }}
    >
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
        const isCurrent = p === page;
        return (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-label={`Page ${p} of ${totalPages}`}
            aria-current={isCurrent ? 'page' : undefined}
            style={{
              width: size,
              height: size,
              borderRadius: 4,
              background: isCurrent
                ? 'var(--primary)'
                : isTable
                  ? 'var(--bg-elevated)'
                  : 'var(--bg-card)',
              border: `1px solid ${isCurrent ? 'var(--primary)' : 'var(--border)'}`,
              color: isCurrent ? 'var(--on-dark)' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontWeight: isTable ? 700 : 600,
              fontSize: isTable ? '0.82rem' : '0.88rem',
            }}
          >
            {p}
          </button>
        );
      })}
    </nav>
  );
}

Pagination.propTypes = {
  page: PropTypes.number.isRequired,
  totalPages: PropTypes.number,
  onChange: PropTypes.func.isRequired,
  variant: PropTypes.oneOf(['table', 'standalone']),
};
