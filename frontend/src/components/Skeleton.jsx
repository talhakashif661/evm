import PropTypes from 'prop-types';

export function Skeleton({ width = '100%', height = 16, radius, style = {} }) {
  return (
    <div
      className="skeleton"
      style={{ width, height, borderRadius: radius ?? 'var(--radius-sm)', ...style }}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="ev-card" style={{ padding: 20 }}>
      <Skeleton height={140} radius={12} style={{ marginBottom: 16 }} />
      <Skeleton height={18} width="70%" style={{ marginBottom: 10 }} />
      <Skeleton height={14} width="40%" style={{ marginBottom: 14 }} />
      <Skeleton height={36} radius={9} />
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '14px 0' }}>
      <Skeleton width={40} height={40} radius="50%" />
      <div style={{ flex: 1 }}>
        <Skeleton height={14} width="60%" style={{ marginBottom: 8 }} />
        <Skeleton height={12} width="35%" />
      </div>
    </div>
  );
}

// <tbody> loading placeholder for history/list tables — `columns` bars per
// row so the skeleton lines up with however many <th> the table has.
export function SkeletonTableRows({ rows = 5, columns = 5 }) {
  return (
    <>
      {Array.from({ length: rows }, (_, rowIndex) => (
        <tr key={rowIndex}>
          {Array.from({ length: columns }, (_, colIndex) => (
            <td key={colIndex}>
              <Skeleton height={14} width={colIndex === 0 ? '70%' : '85%'} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

const sizeType = PropTypes.oneOfType([PropTypes.string, PropTypes.number]);

Skeleton.propTypes = {
  width: sizeType,
  height: sizeType,
  radius: sizeType,
  style: PropTypes.object,
};

SkeletonTableRows.propTypes = {
  rows: PropTypes.number,
  columns: PropTypes.number,
};
