import { useEffect, useState, useRef, useId } from 'react';
import PropTypes from 'prop-types';
import { motion } from 'framer-motion';
import { Inbox, X } from 'lucide-react';

export default function Spinner({ fullPage }) {
  if (fullPage) return (
    <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div className="ev-spinner" style={{ margin: '0 auto 16px' }} />
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Loading...</p>
      </div>
    </div>
  );
  return <div className="ev-spinner" />;
}

export function StatCard({ label, value, icon, color = 'var(--primary)', sub }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="stat-card"
      style={{ height: '100%' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>{label}</p>
          <p style={{ fontSize: '2rem', fontWeight: 700, fontFamily: 'Inter', color, lineHeight: 1 }}>{value}</p>
          {sub && <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: 6 }}>{sub}</p>}
        </div>
        {icon && <span style={{ fontSize: '1.8rem', opacity: 0.7 }}>{icon}</span>}
      </div>
    </motion.div>
  );
}

export function BatteryBar({ percentage }) {
  const color = percentage > 60 ? 'var(--success)' : percentage > 30 ? 'var(--warning)' : 'var(--danger)';
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Battery</span>
        <span style={{ fontSize: '0.78rem', fontWeight: 600, color }}>{percentage}%</span>
      </div>
      <div className="battery-bar">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="battery-fill"
          style={{ background: color }}
        />
      </div>
    </div>
  );
}

export function SlotStatusBadge({ status }) {
  const map = {
    AVAILABLE: { label: 'Available', cls: 'badge-success' },
    OCCUPIED: { label: 'Occupied', cls: 'badge-danger' },
    RESERVED: { label: 'Reserved', cls: 'badge-warning' },
    MAINTENANCE: { label: 'Maintenance', cls: 'badge-info' }
  };
  const s = map[status] || { label: status, cls: 'badge-info' };
  return <span className={s.cls}>{s.label}</span>;
}

export function BookingStatusBadge({ status }) {
  const map = {
    PENDING: 'badge-warning',
    CONFIRMED: 'badge-info',
    CHECKED_IN: 'badge-warning',
    ACTIVE: 'badge-success',
    COMPLETED: 'badge-gold',
    CANCELLED: 'badge-danger'
  };
  return <span className={map[status] || 'badge-info'}>{status.replace('_', ' ')}</span>;
}

// Ticks down to `deadline` (Date or ISO string) every second; calls onExpire
// once when it hits zero. Used for the check-in and payment-grace windows.
export function Countdown({ deadline, onExpire, style }) {
  const [msLeft, setMsLeft] = useState(() => new Date(deadline).getTime() - Date.now());

  useEffect(() => {
    setMsLeft(new Date(deadline).getTime() - Date.now());
    const interval = setInterval(() => {
      setMsLeft(new Date(deadline).getTime() - Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  // Deliberately depends on the derived boolean, not `msLeft` itself — the
  // other effect above ticks msLeft every second, and this one should only
  // re-fire once, when expiry status actually flips, not on every tick.
  const isExpired = msLeft <= 0;
  useEffect(() => {
    if (isExpired) onExpire?.();
    // No current caller in this app passes onExpire (checked directly), so
    // this is currently a no-op either way. If one ever does with an inline,
    // non-memoized function, the only consequence is a possible extra call
    // if the parent re-renders again after expiry — not a correctness bug,
    // just worth knowing about.
  }, [isExpired, onExpire]);

  if (isExpired) return <span style={style}>Expired</span>;
  const totalSeconds = Math.floor(msLeft / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return <span style={style}>{minutes}:{String(seconds).padStart(2, '0')}</span>;
}

export function Modal({ show, onClose, title, children }) {
  const panelRef = useRef(null);
  const previouslyFocused = useRef(null);
  const titleId = useId();

  // Move focus into the dialog when it opens (screen reader users otherwise
  // have no indication anything happened — whatever was focused before stays
  // focused, even though it's now visually behind the overlay), and restore
  // focus to whatever triggered it when it closes, rather than leaving focus
  // wherever it happened to end up.
  useEffect(() => {
    if (show) {
      previouslyFocused.current = document.activeElement;
      // Wait a tick for the panel to actually mount before focusing it.
      const id = requestAnimationFrame(() => panelRef.current?.focus());
      return () => cancelAnimationFrame(id);
    } else if (previouslyFocused.current) {
      previouslyFocused.current.focus?.();
      previouslyFocused.current = null;
    }
  }, [show]);

  // Escape to close, and a basic focus trap so Tab/Shift+Tab cycle within
  // the dialog instead of escaping to the page underneath — both standard,
  // expected parts of the WAI-ARIA dialog pattern that a custom div-based
  // modal (unlike a native <dialog>) doesn't get for free.
  useEffect(() => {
    if (!show) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll(
        'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [show, onClose]);

  if (!show) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <motion.div
        ref={panelRef}
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: 32,
          width: '100%',
          maxWidth: 520,
          maxHeight: '90vh',
          overflowY: 'auto'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h3 id={titleId} style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 700, fontSize: '1.8rem', letterSpacing: '0.02em' }}>{title}</h3>
          <button onClick={onClose} aria-label="Close dialog" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 4 }}>
            <X size={22} />
          </button>
        </div>
        {children}
      </motion.div>
    </div>
  );
}

export function EmptyState({ icon, title, subtitle, action }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <div style={{ fontSize: '3rem', marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
        {icon || <Inbox size={48} color="var(--text-muted)" strokeWidth={1.5} />}
      </div>
      {title && <h4 style={{ fontFamily: 'Inter', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>{title}</h4>}
      {subtitle && <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: 20 }}>{subtitle}</p>}
      {action}
    </div>
  );
}

Spinner.propTypes = {
  fullPage: PropTypes.bool,
};

StatCard.propTypes = {
  label: PropTypes.node,
  value: PropTypes.node,
  icon: PropTypes.node,
  color: PropTypes.string,
  sub: PropTypes.node,
};

BatteryBar.propTypes = {
  percentage: PropTypes.number.isRequired,
};

SlotStatusBadge.propTypes = {
  status: PropTypes.string.isRequired,
};

BookingStatusBadge.propTypes = {
  status: PropTypes.string.isRequired,
};

Countdown.propTypes = {
  deadline: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.number,
    PropTypes.instanceOf(Date),
  ]).isRequired,
  onExpire: PropTypes.func,
  style: PropTypes.object,
};

Modal.propTypes = {
  show: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  title: PropTypes.node,
  children: PropTypes.node,
};

EmptyState.propTypes = {
  icon: PropTypes.node,
  title: PropTypes.node,
  subtitle: PropTypes.node,
  action: PropTypes.node,
};
