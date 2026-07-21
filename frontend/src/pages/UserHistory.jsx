import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Zap, ArrowRight, BatteryCharging, Receipt, TrendingUp } from 'lucide-react';
import api from '../utils/api';
import { Skeleton, SkeletonRow } from '../components/Skeleton';
import { EmptyState } from '../components/Spinner';
import { toPKR } from '../utils/pkr';
import { logger } from '../utils/logger';
import SEO from '../components/SEO';

const statusBadge = (s) => {
  const map = {
    COMPLETED: 'badge-success',
    CONFIRMED: 'badge-primary',
    ACTIVE: 'badge-warning',
    CANCELLED: 'badge-danger',
  };
  return map[s] || 'badge-info';
};

export default function UserHistory() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, completed: 0, totalEnergy: 0, totalSpent: 0 });
  const [statsLoading, setStatsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);
  useEffect(() => {
    fetchStats();
  }, []);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/bookings?page=${page}&limit=15`);
      setHistory(res.data.data || []);
      setPagination(res.data.pagination);
    } catch (e) {
      logger.error(e);
    } finally {
      setLoading(false);
    }
  }, [page]);

  // Stats must reflect the user's ENTIRE history, not just the current
  // 15-row page — fetched separately so pagination doesn't skew the totals.
  const fetchStats = async () => {
    setStatsLoading(true);
    try {
      const res = await api.get(`/bookings?page=1&limit=1000`);
      const all = res.data.data || [];
      const completed = all.filter((b) => b.status === 'COMPLETED');
      setStats({
        total: res.data.pagination?.total ?? all.length,
        completed: completed.length,
        totalEnergy: completed.reduce(
          (a, b) =>
            a +
            (b.slot?.powerKw || 0) * ((new Date(b.endTime) - new Date(b.startTime)) / 3600000 || 0),
          0
        ),
        // Only count what was actually paid, not just billed.
        totalSpent: completed.filter((b) => b.payment).reduce((a, b) => a + (b.totalCost || 0), 0),
      });
    } catch (e) {
      logger.error(e);
    } finally {
      setStatsLoading(false);
    }
  };

  return (
    <div className="page-container">
      <SEO
        title="Charging History"
        description="Review your complete EV charging history, including energy used, total spend, and completed sessions."
        noIndex
      />
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div style={{ marginBottom: 28 }}>
          <h1
            style={{
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontSize: '2.6rem',
              fontWeight: 700,
              letterSpacing: '0.02em',
              marginBottom: 6,
            }}
          >
            Charging <span style={{ color: 'var(--primary)' }}>History</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Your complete EV charging activity log
          </p>
        </div>

        {/* Stats */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))',
            gap: 16,
            marginBottom: 32,
          }}
        >
          {statsLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="stat-card" style={{ textAlign: 'center', padding: 20 }}>
                  <Skeleton height={28} width="50%" style={{ margin: '0 auto 8px' }} />
                  <Skeleton height={11} width="70%" style={{ margin: '0 auto' }} />
                </div>
              ))
            : [
                { label: 'Total Sessions', value: stats.total, color: 'var(--primary)' },
                { label: 'Completed', value: stats.completed, color: 'var(--success)' },
                {
                  label: 'Energy Used',
                  value: `${stats.totalEnergy.toFixed(1)} kWh`,
                  color: 'var(--accent)',
                },
                { label: 'Total Spent', value: toPKR(stats.totalSpent), color: 'var(--warning)' },
              ].map((s) => (
                <div
                  key={s.label}
                  className="stat-card"
                  style={{ textAlign: 'center', padding: 20 }}
                >
                  <p
                    style={{
                      fontSize: '1.8rem',
                      fontWeight: 700,
                      fontFamily: 'Inter',
                      color: s.color,
                    }}
                  >
                    {s.value}
                  </p>
                  <p
                    style={{
                      color: 'var(--text-muted)',
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      marginTop: 4,
                    }}
                  >
                    {s.label}
                  </p>
                </div>
              ))}
        </div>

        {/* History Table */}
        {loading ? (
          <div className="ev-card" style={{ padding: '8px 24px' }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : history.length === 0 ? (
          <div className="ev-card" style={{ padding: 48 }}>
            <EmptyState
              icon={<Zap size={48} color="var(--text-muted)" strokeWidth={1.5} />}
              title="No charging history yet"
              subtitle="Once you complete a charging session, it shows up here — with the energy used, what it cost, and how your usage trends over time."
              action={
                <Link to="/stations">
                  <button className="btn-primary">
                    Find a Station <ArrowRight size={14} />
                  </button>
                </Link>
              }
            />
            <div className="row g-4" style={{ marginTop: 32, textAlign: 'left' }}>
              <div
                className="col-12 col-md-4"
                style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}
              >
                <BatteryCharging
                  size={20}
                  color="var(--accent-gold-dark)"
                  style={{ flexShrink: 0, marginTop: 2 }}
                />
                <div>
                  <strong style={{ fontSize: '0.9rem' }}>Energy tracking</strong>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: 0 }}>
                    See exactly how many kWh each session used.
                  </p>
                </div>
              </div>
              <div
                className="col-12 col-md-4"
                style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}
              >
                <Receipt
                  size={20}
                  color="var(--accent-gold-dark)"
                  style={{ flexShrink: 0, marginTop: 2 }}
                />
                <div>
                  <strong style={{ fontSize: '0.9rem' }}>Cost breakdown</strong>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: 0 }}>
                    Every session&apos;s price, at the rate you actually paid.
                  </p>
                </div>
              </div>
              <div
                className="col-12 col-md-4"
                style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}
              >
                <TrendingUp
                  size={20}
                  color="var(--accent-gold-dark)"
                  style={{ flexShrink: 0, marginTop: 2 }}
                />
                <div>
                  <strong style={{ fontSize: '0.9rem' }}>Usage trends</strong>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: 0 }}>
                    Spot your charging patterns as history builds up.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="ev-card" style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="ev-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Station</th>
                    <th>City</th>
                    <th>Slot</th>
                    <th>EV Model</th>
                    <th>Start Time</th>
                    <th>End Time</th>
                    <th>Duration</th>
                    <th>Energy</th>
                    <th>Cost</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((b, i) => {
                    const start = new Date(b.startTime);
                    const end = b.endTime ? new Date(b.endTime) : null;
                    const durationMins = end ? Math.round((end - start) / 60000) : null;
                    const energyKwh =
                      durationMins && b.slot?.powerKw
                        ? ((durationMins / 60) * b.slot.powerKw).toFixed(2)
                        : '—';
                    return (
                      <motion.tr
                        key={b.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1, transition: { delay: i * 0.03 } }}
                      >
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                          {(page - 1) * 15 + i + 1}
                        </td>
                        <td>
                          <p style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                            {b.slot?.station?.name || '—'}
                          </p>
                          <p style={{ color: 'var(--text-muted)', fontSize: '0.74rem' }}>
                            {b.slot?.station?.address}
                          </p>
                        </td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                          {b.slot?.station?.city || '—'}
                        </td>
                        <td style={{ color: 'var(--primary)', fontWeight: 600 }}>
                          #{b.slot?.slotNumber}
                        </td>
                        <td style={{ fontSize: '0.85rem' }}>{b.ev?.model || '—'}</td>
                        <td
                          style={{
                            color: 'var(--text-secondary)',
                            fontSize: '0.82rem',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {start.toLocaleDateString()}
                          <br />
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                            {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </td>
                        <td
                          style={{
                            color: 'var(--text-secondary)',
                            fontSize: '0.82rem',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {end ? (
                            <>
                              {end.toLocaleDateString()}
                              <br />
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                {end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                          {durationMins ? `${durationMins} min` : '—'}
                        </td>
                        <td style={{ color: 'var(--accent)', fontWeight: 600 }}>
                          {energyKwh} {energyKwh !== '—' ? 'kWh' : ''}
                        </td>
                        <td
                          style={{ color: 'var(--warning)', fontWeight: 700, fontFamily: 'Inter' }}
                        >
                          {b.totalCost ? toPKR(b.totalCost) : '—'}
                        </td>
                        <td>
                          <span className={statusBadge(b.status)}>{b.status}</span>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination && pagination.pages > 1 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '16px 24px',
                  borderTop: '1px solid var(--border)',
                }}
              >
                {Array.from({ length: pagination.pages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 4,
                      background: p === page ? 'var(--primary)' : 'var(--bg-elevated)',
                      border: `1px solid ${p === page ? 'var(--primary)' : 'var(--border)'}`,
                      color: p === page ? '#ffffff' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontWeight: 700,
                      fontSize: '0.82rem',
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
