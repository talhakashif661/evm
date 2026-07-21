import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import {
  ScrollText,
  ShieldCheck,
  ShieldX,
  UserMinus,
  UserCog,
  Zap,
  KeyRound,
  Trash2,
  Star,
} from 'lucide-react';
import { fetchLogs } from '../../store/slices/adminLogsSlice';
import { EmptyState } from '../../components/Spinner';
import { Skeleton } from '../../components/Skeleton';
import SEO from '../../components/SEO';

// Action -> presentation. Falls back to a neutral badge for future actions.
const ACTION_META = {
  USER_BLOCKED: { label: 'User Blocked', color: 'var(--danger)', icon: ShieldX },
  USER_UNBLOCKED: { label: 'User Unblocked', color: 'var(--success)', icon: ShieldCheck },
  USER_DELETED: { label: 'User Deleted', color: 'var(--danger)', icon: UserMinus },
  USER_PROMOTED_ADMIN: { label: 'Promoted to Admin', color: 'var(--info)', icon: UserCog },
  STATION_APPROVED: { label: 'Station Approved', color: 'var(--success)', icon: Zap },
  STATION_REJECTED: { label: 'Station Rejected', color: 'var(--danger)', icon: Zap },
  ADMIN_BOOTSTRAPPED: { label: 'Admin Bootstrap', color: 'var(--warning)', icon: KeyRound },
  COMPLAINT_DELETED: { label: 'Complaint Deleted', color: 'var(--danger)', icon: Trash2 },
  REVIEW_DELETED: { label: 'Review Moderated', color: 'var(--danger)', icon: Star },
};

function ActionBadge({ action }) {
  const meta = ACTION_META[action] || {
    label: action,
    color: 'var(--text-secondary)',
    icon: ScrollText,
  };
  const Icon = meta.icon;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        color: meta.color,
        fontWeight: 700,
        fontSize: '0.78rem',
        whiteSpace: 'nowrap',
      }}
    >
      <Icon size={14} /> {meta.label}
    </span>
  );
}

export default function AdminLogs() {
  const dispatch = useDispatch();
  const { logs, loading, pagination } = useSelector((s) => s.adminLogs);
  const [page, setPage] = useState(1);

  useEffect(() => {
    dispatch(fetchLogs({ page, limit: 25 }));
  }, [dispatch, page]);

  return (
    <div>
      <SEO
        title="Audit Logs"
        description="Review administrative audit logs tracking key actions across the ChargeEV platform."
        noIndex
      />
      <div style={{ marginBottom: 24 }}>
        <h1 className="section-title">
          Audit <span>Log</span>
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
          A permanent record of sensitive admin actions — who did what, and when.
        </p>
      </div>

      {loading ? (
        <div
          className="ev-card"
          style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} height={16} width={`${85 - i * 5}%`} />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <EmptyState
          icon={<ScrollText size={48} color="var(--text-muted)" strokeWidth={1.5} />}
          title="No audit entries yet"
          subtitle="Admin actions (block, delete, promote, approve/reject) will be recorded here."
        />
      ) : (
        <>
          <div className="ev-card" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="ev-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Action</th>
                  <th>Details</th>
                  <th>Actor</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l, i) => (
                  <motion.tr
                    key={l.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                  >
                    <td
                      style={{
                        whiteSpace: 'nowrap',
                        color: 'var(--text-secondary)',
                        fontSize: '0.82rem',
                      }}
                    >
                      {new Date(l.createdAt).toLocaleString()}
                    </td>
                    <td>
                      <ActionBadge action={l.action} />
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>{l.details || '—'}</td>
                    <td style={{ fontSize: '0.85rem' }}>
                      {l.actor ? (
                        <span title={l.actor.email}>{l.actor.name}</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>system</span>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      {l.ipAddress || '—'}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination && pagination.pages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
              <button
                className="btn-outline"
                style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span
                style={{ alignSelf: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}
              >
                Page {pagination.page} of {pagination.pages}
              </span>
              <button
                className="btn-outline"
                style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                disabled={page >= pagination.pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
