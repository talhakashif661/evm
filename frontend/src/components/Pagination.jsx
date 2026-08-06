import PropTypes from 'prop-types';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Page-number control shared by every history/list page in the app —
 * bookings, payments, complaints, audit logs, reviews, auctions, station
 * grid, revenue table, etc.
 *
 * Those all used to grow their own near-identical copies of this markup,
 * differing only in button size and whether they sat inside a table footer
 * — which is why `variant` exists rather than a pile of style props. Two
 * genuine layouts, named after where they're used:
 *
 *   table      — sits under a table body, so it carries the divider rule and
 *                the cell padding that lines it up with the rows above.
 *   standalone — floats below a card grid with its own top margin.
 *
 * `total`/`limit` are optional: pass both to also render a "Showing X–Y of Z
 * records" line above the page controls. Callers that don't pass them just
 * get the page nav, unchanged.
 */

// First/last page plus a window of `delta` pages either side of the current
// one, with '…' markers for any gap — otherwise a 30-page result set would
// render 30 buttons in a row.
const buildPageWindow = (page, totalPages, delta = 1) => {
  const pages = [];
  for (let i = 1; i <= totalPages; i += 1) {
    if (i === 1 || i === totalPages || (i >= page - delta && i <= page + delta)) {
      pages.push(i);
    }
  }
  const withEllipsis = [];
  let previous = 0;
  for (const p of pages) {
    if (previous) {
      if (p - previous === 2) withEllipsis.push(previous + 1);
      else if (p - previous > 2) withEllipsis.push('…');
    }
    withEllipsis.push(p);
    previous = p;
  }
  return withEllipsis;
};

export default function Pagination({ page, totalPages, onChange, variant = 'table', total, limit }) {
  if (!totalPages || totalPages <= 1) return null;

  const isTable = variant === 'table';

  const wrapper = isTable
    ? {
        padding: '16px 24px',
        borderTop: '1px solid var(--border)',
      }
    : { marginTop: 40 };

  const size = isTable ? 36 : 40;
  const hasSummary = total != null && limit != null;
  const showingFrom = hasSummary ? (page - 1) * limit + 1 : null;
  const showingTo = hasSummary ? Math.min(page * limit, total) : null;

  const navButtonStyle = {
    height: size,
    minWidth: size,
    padding: '0 10px',
    borderRadius: 4,
    background: isTable ? 'var(--bg-elevated)' : 'var(--bg-card)',
    border: '1px solid var(--border)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: isTable ? '0.82rem' : '0.88rem',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  };

  return (
    <div style={wrapper}>
      {hasSummary && (
        <p
          style={{
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: '0.8rem',
            marginBottom: 10,
          }}
        >
          Showing {showingFrom}–{showingTo} of {total} records
        </p>
      )}
      <nav aria-label="Pagination" style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          style={{ ...navButtonStyle, opacity: page <= 1 ? 0.5 : 1 }}
        >
          <ChevronLeft size={14} aria-hidden="true" />
          Prev
        </button>

        {buildPageWindow(page, totalPages).map((p, index) =>
          p === '…' ? (
            <span
              key={`ellipsis-${index}`}
              aria-hidden="true"
              style={{
                width: size,
                height: size,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted)',
              }}
            >
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              aria-label={`Page ${p} of ${totalPages}`}
              aria-current={p === page ? 'page' : undefined}
              style={{
                width: size,
                height: size,
                borderRadius: 4,
                background:
                  p === page ? 'var(--primary)' : isTable ? 'var(--bg-elevated)' : 'var(--bg-card)',
                border: `1px solid ${p === page ? 'var(--primary)' : 'var(--border)'}`,
                color: p === page ? 'var(--on-dark)' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontWeight: isTable ? 700 : 600,
                fontSize: isTable ? '0.82rem' : '0.88rem',
              }}
            >
              {p}
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
          style={{ ...navButtonStyle, opacity: page >= totalPages ? 0.5 : 1 }}
        >
          Next
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      </nav>
    </div>
  );
}

Pagination.propTypes = {
  page: PropTypes.number.isRequired,
  totalPages: PropTypes.number,
  onChange: PropTypes.func.isRequired,
  variant: PropTypes.oneOf(['table', 'standalone']),
  total: PropTypes.number,
  limit: PropTypes.number,
};
