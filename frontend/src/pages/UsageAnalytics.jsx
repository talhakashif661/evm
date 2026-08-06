import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Zap, BatteryCharging, Receipt, TrendingUp, ArrowRight } from 'lucide-react';
import {
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  CartesianGrid,
} from 'recharts';
import api from '../utils/api';
import { toPKR } from '../utils/pkr';
import { logger } from '../utils/logger';
import { Skeleton, SkeletonRow } from '../components/Skeleton';
import { StatCard, EmptyState, BookingStatusBadge } from '../components/Spinner';
import SEO from '../components/SEO';
import Pagination from '../components/Pagination.jsx';

const ROWS_PER_PAGE = 10;

const formatEnergy = (value) => (value != null ? `${Number(value).toFixed(2)} kWh` : '—');
const formatBattery = (value) => (value != null ? `${Math.round(value)}%` : '—');
const formatDuration = (value) => (value != null ? `${value} min` : '—');
const formatDate = (value) => (value ? new Date(value).toLocaleDateString('en-PK') : '—');

const sectionHeadingStyle = {
  fontFamily: 'Inter',
  fontSize: '1.1rem',
  fontWeight: 700,
  marginBottom: 20,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

function CostTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '10px 14px',
      }}
    >
      <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: 4 }}>{label}</p>
      <p style={{ color: 'var(--primary)', fontWeight: 700, fontFamily: 'Inter', fontSize: '1.1rem' }}>
        {toPKR(payload[0].value)}
      </p>
    </div>
  );
}

function BatteryTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '10px 14px',
      }}
    >
      <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: 6 }}>{label}</p>
      {payload.map((p) => (
        <p
          key={p.dataKey}
          style={{ color: p.color, fontWeight: 700, fontFamily: 'Inter', fontSize: '0.85rem' }}
        >
          {p.name}: {Math.round(p.value)}%
        </p>
      ))}
    </div>
  );
}

export default function UsageAnalytics() {
  const [data, setData] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/users/usage-analytics', {
        params: { page, limit: ROWS_PER_PAGE },
      });
      setData(res.data.data);
      setPagination(res.data.pagination);
    } catch (e) {
      logger.error(e);
      setError(e.response?.data?.message || 'Unable to load your usage analytics right now.');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  if (loading) {
    return (
      <div className="page-container">
        <Skeleton height={40} width="45%" style={{ marginBottom: 6 }} />
        <Skeleton height={16} width="60%" style={{ marginBottom: 28 }} />
        <div className="row g-3 mb-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="col-6 col-md-3">
              <div className="stat-card">
                <Skeleton height={14} width="60%" style={{ marginBottom: 10 }} />
                <Skeleton height={26} width="40%" />
              </div>
            </div>
          ))}
        </div>
        <div className="ev-card" style={{ padding: 24, marginBottom: 24 }}>
          <Skeleton height={18} width="30%" style={{ marginBottom: 20 }} />
          <Skeleton height={220} radius={8} />
        </div>
        <div className="ev-card" style={{ padding: 24, marginBottom: 24 }}>
          <Skeleton height={18} width="30%" style={{ marginBottom: 20 }} />
          <Skeleton height={220} radius={8} />
        </div>
        <div className="ev-card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '18px 20px' }}>
            <Skeleton height={18} width="35%" />
          </div>
          <div style={{ padding: '0 20px' }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const hasMonthlyCost = data?.monthlyCostData?.some((m) => m.cost > 0);
  const hasBatteryPattern = data?.batteryPatternData?.length > 0;
  const batteryChartData = (data?.batteryPatternData || []).map((d) => ({
    ...d,
    date: formatDate(d.date),
  }));

  return (
    <div className="page-container">
      <SEO
        title="Usage Analytics"
        description="Track your EV charging history, costs, and battery patterns."
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
            Usage <span style={{ color: 'var(--primary)' }}>Analytics</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Track your charging history, costs, and battery patterns.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="ev-card"
            style={{ padding: 16, marginBottom: 24, color: 'var(--danger)' }}
          >
            {error}
          </div>
        )}

        {!error && data && (
          <>
            {/* Summary cards */}
            <div className="row g-3 mb-4">
              <div className="col-6 col-md-3">
                <StatCard
                  label="Total Charging Sessions"
                  value={data.totalSessions}
                  icon={<Zap size={22} />}
                  color="var(--primary)"
                />
              </div>
              <div className="col-6 col-md-3">
                <StatCard
                  label="Total Energy Used"
                  value={formatEnergy(data.totalEnergyUsed)}
                  icon={<BatteryCharging size={22} />}
                  color="var(--accent)"
                />
              </div>
              <div className="col-6 col-md-3">
                <StatCard
                  label="Total Amount Spent"
                  value={toPKR(data.totalAmountSpent)}
                  icon={<Receipt size={22} />}
                  color="var(--warning)"
                />
              </div>
              <div className="col-6 col-md-3">
                <StatCard
                  label="Avg. Battery Charged"
                  value={`${data.averageBatteryCharged}%`}
                  icon={<TrendingUp size={22} />}
                  color="var(--success)"
                />
              </div>
            </div>

            {/* Monthly Charging Cost */}
            <div className="ev-card" style={{ padding: 24, marginBottom: 24 }}>
              <h2 style={sectionHeadingStyle}>Monthly Charging Cost</h2>
              {!hasMonthlyCost ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>
                  No payment data available yet — complete a charging session to see your monthly
                  cost trend here.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={data.monthlyCostData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                    <XAxis
                      dataKey="month"
                      tick={{ fill: 'var(--chart-axis)', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: 'var(--chart-axis)', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(value) => `Rs.${value}`}
                    />
                    <Tooltip content={<CostTooltip />} />
                    <Bar dataKey="cost" name="Cost" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Battery Charging Pattern */}
            <div className="ev-card" style={{ padding: 24, marginBottom: 24 }}>
              <h2 style={sectionHeadingStyle}>Battery Charging Pattern</h2>
              {!hasBatteryPattern ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>
                  No battery readings available yet — this fills in once you complete charging
                  sessions.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={batteryChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: 'var(--chart-axis)', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fill: 'var(--chart-axis)', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(value) => `${value}%`}
                    />
                    <Tooltip content={<BatteryTooltip />} />
                    <Legend wrapperStyle={{ fontSize: '0.78rem' }} />
                    <Line
                      type="monotone"
                      dataKey="batteryBefore"
                      name="Battery Before"
                      stroke="var(--warning)"
                      strokeWidth={2}
                      dot={{ fill: 'var(--warning)', r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="batteryAfter"
                      name="Battery After"
                      stroke="var(--success)"
                      strokeWidth={2}
                      dot={{ fill: 'var(--success)', r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Charging History */}
            <div className="ev-card" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
                <h2 style={{ ...sectionHeadingStyle, marginBottom: 0 }}>Charging History</h2>
              </div>
              {data.paginatedChargingHistory.length === 0 ? (
                <div style={{ padding: 24 }}>
                  <EmptyState
                    icon={<Zap size={48} color="var(--text-muted)" strokeWidth={1.5} />}
                    title="No charging history yet"
                    subtitle="Once you complete a charging session, it shows up here with duration, energy used, battery change, and cost."
                    action={
                      <Link to="/stations">
                        <button className="btn-primary">
                          Find a Station <ArrowRight size={14} />
                        </button>
                      </Link>
                    }
                  />
                </div>
              ) : (
                <>
                  <div className="table-scroll">
                    <table className="ev-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Station</th>
                          <th>Duration</th>
                          <th>Energy Used</th>
                          <th>Battery Before</th>
                          <th>Battery After</th>
                          <th>Total Cost</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.paginatedChargingHistory.map((row, i) => (
                          <motion.tr
                            key={row.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1, transition: { delay: i * 0.03 } }}
                          >
                            <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                              {formatDate(row.date)}
                            </td>
                            <td style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                              {row.stationName}
                            </td>
                            <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                              {formatDuration(row.durationMinutes)}
                            </td>
                            <td style={{ color: 'var(--accent)', fontWeight: 600 }}>
                              {formatEnergy(row.energyUsed)}
                            </td>
                            <td style={{ color: 'var(--warning)', fontSize: '0.85rem' }}>
                              {formatBattery(row.batteryBefore)}
                            </td>
                            <td style={{ color: 'var(--success)', fontSize: '0.85rem' }}>
                              {formatBattery(row.batteryAfter)}
                            </td>
                            <td style={{ color: 'var(--warning)', fontWeight: 700, fontFamily: 'Inter' }}>
                              {toPKR(row.finalCost)}
                            </td>
                            <td>
                              <BookingStatusBadge status={row.status} />
                            </td>
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <Pagination
                    page={page}
                    totalPages={pagination?.pages}
                    onChange={setPage}
                    variant="table"
                    total={pagination?.total}
                    limit={ROWS_PER_PAGE}
                  />
                </>
              )}
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
