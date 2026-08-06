import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
} from 'recharts';
import { Eye, FileText, Loader2 } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import api from '../utils/api';
import { toPKR } from '../utils/pkr';
import { logger } from '../utils/logger';
import { Skeleton, SkeletonRow } from '../components/Skeleton';
import { Modal, EmptyState } from '../components/Spinner';
import SEO from '../components/SEO';
import Pagination from '../components/Pagination.jsx';

const PERIODS = ['daily', 'weekly', 'monthly', 'yearly'];
const ROWS_PER_PAGE = 10;
const EMPTY_FILTERS = {
  search: '',
  dateFrom: '',
  dateTo: '',
  sessionStatus: '',
  paymentStatus: '',
  slotNumber: '',
};
const EMPTY_SUMMARY = {
  totalSessions: 0,
  completedSessions: 0,
  cancelledSessions: 0,
  emergencyStoppedSessions: 0,
  totalRevenue: 0,
  totalRefundAmount: 0,
  totalEnergyDelivered: 0,
};

const formatDate = (value) => (value ? new Date(value).toLocaleDateString('en-PK') : '—');
const formatTime = (value) =>
  value
    ? new Date(value).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })
    : '—';
const formatDateTime = (value) => (value ? new Date(value).toLocaleString('en-PK') : '—');
const formatDuration = (value) => (value != null ? `${value} min` : '—');
const formatEnergy = (value) => (value != null ? `${Number(value).toFixed(2)} kWh` : '—');
const formatMoney = (value) => (value != null ? toPKR(value) : '—');
const displayStatus = (value) => value?.replaceAll('_', ' ') || '—';

function DetailField({ label, value }) {
  return (
    <div className="col-12 col-sm-6">
      <p
        style={{
          color: 'var(--text-muted)',
          fontSize: '0.72rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: 4,
        }}
      >
        {label}
      </p>
      <p
        style={{
          color: 'var(--text-primary)',
          fontSize: '0.9rem',
          fontWeight: 600,
          margin: 0,
          overflowWrap: 'anywhere',
        }}
      >
        {value ?? '—'}
      </p>
    </div>
  );
}

function BookingDetails({ booking }) {
  return (
    <div>
      <h4 style={{ fontSize: '1rem', marginBottom: 14 }}>Booking</h4>
      <div className="row g-3 mb-4">
        <DetailField label="Booking ID" value={booking.id} />
        <DetailField label="Session ID" value={booking.sessionId} />
        <DetailField label="User Name" value={booking.user?.name} />
        <DetailField label="User Email" value={booking.user?.email} />
        <DetailField label="EV Model" value={booking.ev?.model} />
        <DetailField label="License Plate" value={booking.ev?.licensePlate} />
        <DetailField label="Slot Number" value={booking.slot?.slotNumber} />
        <DetailField label="Session Status" value={displayStatus(booking.sessionStatus)} />
      </div>

      <h4 style={{ fontSize: '1rem', marginBottom: 14 }}>Charging</h4>
      <div className="row g-3 mb-4">
        <DetailField label="Date" value={formatDate(booking.sessionStartTime)} />
        <DetailField label="Scheduled Start" value={formatDateTime(booking.startTime)} />
        <DetailField label="Planned End" value={formatDateTime(booking.plannedEndTime)} />
        <DetailField label="Check In" value={formatDateTime(booking.checkInTime)} />
        <DetailField
          label="Charging Started"
          value={formatDateTime(booking.chargingStartedAt)}
        />
        <DetailField label="Actual End" value={formatDateTime(booking.endTime)} />
        <DetailField
          label="Duration"
          value={formatDuration(booking.sessionDurationMinutes)}
        />
        <DetailField
          label="Energy Delivered"
          value={formatEnergy(booking.energyDeliveredKwh)}
        />
        <DetailField label="Price per kWh" value={formatMoney(booking.pricePerKwh)} />
      </div>

      <h4 style={{ fontSize: '1rem', marginBottom: 14 }}>Payment & Refund</h4>
      <div className="row g-3 mb-4">
        <DetailField label="Payment ID" value={booking.payment?.id} />
        <DetailField label="Payment Method" value={booking.payment?.method} />
        <DetailField label="Payment Status" value={displayStatus(booking.payment?.status)} />
        <DetailField label="Paid Amount" value={formatMoney(booking.paidAmount)} />
        <DetailField
          label="Refund Amount"
          value={formatMoney(booking.refundAmount)}
        />
        <DetailField
          label="Final Charged Amount"
          value={formatMoney(booking.finalChargedAmount)}
        />
        <DetailField label="Final Session Bill" value={formatMoney(booking.finalBill)} />
      </div>

      <h4 style={{ fontSize: '1rem', marginBottom: 14 }}>Booking Outcome</h4>
      <div className="row g-3">
        <DetailField label="Cancellation Reason" value={booking.cancelReason} />
        <DetailField label="Created" value={formatDateTime(booking.createdAt)} />
        <DetailField label="Last Updated" value={formatDateTime(booking.updatedAt)} />
      </div>

      {booking.sessionStatus === 'EMERGENCY_STOPPED' && (
        <>
          <h4 style={{ fontSize: '1rem', marginTop: 20, marginBottom: 14 }}>
            Incident Information
          </h4>
          <div className="row g-3">
            <DetailField label="Status" value="🟠 Emergency Stopped" />
            <DetailField label="Stopped By" value={booking.emergencyStoppedByName} />
            <DetailField label="Stopped At" value={formatDateTime(booking.emergencyStoppedAt)} />
            <DetailField label="Reason" value={booking.emergencyReason} />
            <DetailField
              label="Energy Before Stop"
              value={formatEnergy(booking.finalEnergyKwh)}
            />
            <DetailField
              label="Duration Before Stop"
              value={formatDuration(booking.durationMinutes)}
            />
            <DetailField
              label="Amount Charged Before Stop"
              value={formatMoney(booking.finalBill)}
            />
          </div>
        </>
      )}
    </div>
  );
}

const getWeek = (date) => {
  const start = new Date(date.getFullYear(), 0, 1);
  return Math.ceil(((date - start) / 86400000 + start.getDay() + 1) / 7);
};

export default function StationReport() {
  const detailsRequest = useRef(0);
  const [period, setPeriod] = useState('monthly');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [rows, setRows] = useState([]);
  const [chartSessions, setChartSessions] = useState([]);
  const [slotNumbers, setSlotNumbers] = useState([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [tablePage, setTablePage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState(null);
  const [bookingDetails, setBookingDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(filters.search.trim()), 300);
    return () => clearTimeout(timer);
  }, [filters.search]);

  useEffect(() => {
    setTablePage(1);
  }, [
    debouncedSearch,
    filters.dateFrom,
    filters.dateTo,
    filters.sessionStatus,
    filters.paymentStatus,
    filters.slotNumber,
  ]);

  const queryParams = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      dateFrom: filters.dateFrom || undefined,
      dateTo: filters.dateTo || undefined,
      sessionStatus: filters.sessionStatus || undefined,
      paymentStatus: filters.paymentStatus || undefined,
      slotNumber: filters.slotNumber || undefined,
    }),
    [
      debouncedSearch,
      filters.dateFrom,
      filters.dateTo,
      filters.sessionStatus,
      filters.paymentStatus,
      filters.slotNumber,
    ]
  );

  useEffect(() => {
    const controller = new AbortController();
    const fetchReport = async () => {
      setError('');
      if (loading) setLoading(true);
      else setRefreshing(true);
      try {
        const response = await api.get('/stations/owner/reports', {
          params: { ...queryParams, page: tablePage, limit: ROWS_PER_PAGE },
          signal: controller.signal,
        });
        setRows(response.data.data?.rows || []);
        setChartSessions(response.data.data?.chartSessions || []);
        setSlotNumbers(response.data.data?.slotNumbers || []);
        setSummary(response.data.data?.summary || EMPTY_SUMMARY);
        setTotalPages(response.data.pagination?.pages || 0);
        setTotalRows(response.data.pagination?.total || 0);
      } catch (requestError) {
        if (requestError.code === 'ERR_CANCELED') return;
        logger.error(requestError);
        setError(requestError.response?.data?.message || 'Unable to load station report.');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };
    fetchReport();
    return () => controller.abort();
    // `loading` is deliberately excluded: it describes presentation state,
    // not report identity, and including it would cause a second fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryParams, tablePage]);

  const chartData = useMemo(() => {
    const buckets = {};
    chartSessions
      .filter((session) =>
        ['COMPLETED', 'EMERGENCY_STOPPED'].includes(session.sessionStatus)
      )
      .forEach((session) => {
        const date = new Date(session.createdAt);
        let key = '';
        if (period === 'daily')
          key = date.toLocaleDateString('en-PK', { day: '2-digit', month: 'short' });
        if (period === 'weekly') key = `W${getWeek(date)} ${date.getFullYear()}`;
        if (period === 'monthly')
          key = date.toLocaleDateString('en-PK', { month: 'short', year: 'numeric' });
        if (period === 'yearly') key = String(date.getFullYear());
        buckets[key] = (buckets[key] || 0) + (session.finalChargedAmount || 0);
      });

    return Object.entries(buckets)
      .map(([name, revenue]) => ({ name, revenue: Number(revenue.toFixed(2)) }))
      .slice(-20);
  }, [chartSessions, period]);

  const updateFilter = (name, value) => {
    setFilters((current) => ({ ...current, [name]: value }));
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setDebouncedSearch('');
    setTablePage(1);
  };

  const openDetails = async (bookingId) => {
    const requestId = ++detailsRequest.current;
    setSelectedBookingId(bookingId);
    setBookingDetails(null);
    setDetailsError('');
    setDetailsLoading(true);
    try {
      const response = await api.get(`/stations/owner/bookings/${bookingId}`);
      if (requestId === detailsRequest.current) setBookingDetails(response.data.data);
    } catch (requestError) {
      if (requestId !== detailsRequest.current) return;
      logger.error(requestError);
      setDetailsError(
        requestError.response?.data?.message || 'Unable to load booking details.'
      );
    } finally {
      if (requestId === detailsRequest.current) setDetailsLoading(false);
    }
  };

  const closeDetails = () => {
    detailsRequest.current += 1;
    setSelectedBookingId(null);
    setBookingDetails(null);
    setDetailsError('');
    setDetailsLoading(false);
  };

  const exportPdf = async () => {
    setExporting(true);
    try {
      const response = await api.get('/stations/owner/reports', {
        params: { ...queryParams, export: true, limit: 5000 },
      });
      const report = response.data.data;
      const exportRows = report?.rows || [];
      const exportSummary = report?.summary || EMPTY_SUMMARY;
      const document = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a3' });

      document.setFontSize(18);
      document.text('Unified EV - Station Owner Report', 40, 42);
      document.setFontSize(9);
      document.text(`Generated: ${new Date().toLocaleString('en-PK')}`, 40, 60);
      document.text(
        `Sessions: ${exportSummary.totalSessions}   Completed: ${exportSummary.completedSessions}   Cancelled: ${exportSummary.cancelledSessions}   Emergency stopped: ${exportSummary.emergencyStoppedSessions}`,
        40,
        78
      );
      document.text(
        `Revenue: ${formatMoney(exportSummary.totalRevenue)}   Refunds: ${formatMoney(exportSummary.totalRefundAmount)}   Energy: ${Number(exportSummary.totalEnergyDelivered || 0).toFixed(2)} kWh`,
        40,
        94
      );

      autoTable(document, {
        startY: 112,
        head: [
          [
            'Booking ID',
            'Session ID',
            'User',
            'EV',
            'Slot',
            'Date',
            'Start',
            'End',
            'Duration',
            'Energy',
            'Paid',
            'Refund',
            'Final Charge',
            'Payment',
            'Session',
          ],
        ],
        body: exportRows.map((booking) => [
          booking.id,
          booking.sessionId,
          booking.user?.name || '—',
          booking.ev?.model || '—',
          booking.slot?.slotNumber ?? '—',
          formatDate(booking.sessionStartTime),
          formatTime(booking.sessionStartTime),
          formatTime(booking.sessionEndTime),
          formatDuration(booking.sessionDurationMinutes),
          formatEnergy(booking.energyDeliveredKwh),
          formatMoney(booking.paidAmount),
          formatMoney(booking.refundAmount),
          formatMoney(booking.finalChargedAmount),
          displayStatus(booking.payment?.status),
          displayStatus(booking.sessionStatus),
        ]),
        styles: { fontSize: 6, cellPadding: 3, overflow: 'linebreak' },
        headStyles: { fillColor: [45, 88, 220] },
        margin: { left: 30, right: 30 },
      });
      document.save(`station-report-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (exportError) {
      logger.error(exportError);
      setError(exportError.response?.data?.message || 'Unable to export the report.');
    } finally {
      setExporting(false);
    }
  };

  const CustomTooltip = ({ active, payload, label }) => {
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
        <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: 4 }}>
          {label}
        </p>
        <p
          style={{
            color: 'var(--primary)',
            fontWeight: 700,
            fontFamily: 'Inter',
            fontSize: '1.1rem',
          }}
        >
          {toPKR(payload[0].value)}
        </p>
      </div>
    );
  };

  if (loading)
    return (
      <div className="page-container">
        <Skeleton height={40} width="45%" style={{ marginBottom: 6 }} />
        <Skeleton height={16} width="60%" style={{ marginBottom: 28 }} />
        <div className="ev-card" style={{ padding: 24, marginBottom: 24 }}>
          <Skeleton height={18} width="30%" style={{ marginBottom: 20 }} />
          <Skeleton height={220} radius={8} />
        </div>
        <div className="ev-card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '18px 20px' }}>
            <Skeleton height={18} width="35%" />
          </div>
          <div style={{ padding: '0 20px' }}>
            {[...Array(4)].map((_, index) => (
              <SkeletonRow key={index} />
            ))}
          </div>
        </div>
      </div>
    );

  const statusClass = (status) => {
    if (status === 'COMPLETED') return 'badge-success';
    if (status === 'CANCELLED') return 'badge-cancelled';
    if (status === 'EMERGENCY_STOPPED') return 'badge-danger';
    if (status === 'ACTIVE') return 'badge-warning';
    return 'badge-info';
  };

  return (
    <div className="page-container">
      <SEO
        title="Station Reports"
        description="View revenue, bookings, and usage analytics for your EV charging station, broken down by day, week, month, or year."
        noIndex
      />
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div
          style={{
            marginBottom: 28,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h1
              style={{
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontSize: '2.6rem',
                fontWeight: 700,
                letterSpacing: '0.02em',
                marginBottom: 6,
              }}
            >
              Charging <span style={{ color: 'var(--primary)' }}>Report</span>
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              User charging activity at your station
            </p>
          </div>
          <button
            type="button"
            className="btn-outline"
            onClick={exportPdf}
            disabled={exporting}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            {exporting ? (
              <Loader2 size={16} className="spin" aria-hidden="true" />
            ) : (
              <FileText size={16} aria-hidden="true" />
            )}
            {exporting ? 'Exporting...' : 'Export Report to PDF'}
          </button>
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

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))',
            gap: 16,
            marginBottom: 32,
          }}
        >
          {[
            {
              label: 'Total Sessions',
              value: summary.totalSessions,
              color: 'var(--primary)',
            },
            {
              label: 'Completed Sessions',
              value: summary.completedSessions,
              color: 'var(--success)',
            },
            {
              label: 'Cancelled Sessions',
              value: summary.cancelledSessions,
              color: 'var(--danger)',
            },
            {
              label: 'Emergency Stopped Sessions',
              value: summary.emergencyStoppedSessions,
              color: 'var(--warning)',
            },
            {
              label: 'Total Revenue',
              value: formatMoney(summary.totalRevenue),
              color: 'var(--warning)',
            },
            {
              label: 'Total Refund Amount',
              value: formatMoney(summary.totalRefundAmount),
              color: 'var(--danger)',
            },
            {
              label: 'Total Energy Delivered',
              value: formatEnergy(summary.totalEnergyDelivered),
              color: 'var(--accent)',
            },
          ].map((item) => (
            <div
              key={item.label}
              className="stat-card"
              style={{ textAlign: 'center', padding: 20 }}
            >
              <p
                style={{
                  fontSize: '1.7rem',
                  fontWeight: 700,
                  fontFamily: 'Inter',
                  color: item.color,
                }}
              >
                {item.value}
              </p>
              <p
                style={{
                  color: 'var(--text-muted)',
                  fontSize: '0.72rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginTop: 4,
                }}
              >
                {item.label}
              </p>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
          {PERIODS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setPeriod(item)}
              style={{
                padding: '8px 18px',
                borderRadius: 4,
                cursor: 'pointer',
                fontFamily: 'Inter',
                fontWeight: 600,
                textTransform: 'capitalize',
                fontSize: '0.88rem',
                background: period === item ? 'var(--primary-glow)' : 'var(--bg-elevated)',
                border: `1px solid ${period === item ? 'var(--primary)' : 'var(--border)'}`,
                color: period === item ? 'var(--primary)' : 'var(--text-secondary)',
                transition: 'background-color 0.12s ease, border-color 0.12s ease',
              }}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="ev-card" style={{ padding: 24, marginBottom: 24 }}>
          <h2
            style={{
              fontFamily: 'Inter',
              fontSize: '1.1rem',
              fontWeight: 700,
              marginBottom: 20,
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Revenue — {period}
          </h2>
          {chartData.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>
              No completed sessions yet for this period.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: 'var(--chart-axis)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: 'var(--chart-axis)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => `Rs.${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--accent-gold)"
                  strokeWidth={2}
                  fill="var(--accent-gold)"
                  fillOpacity={0.16}
                  dot={{ fill: 'var(--accent-gold)', r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="ev-card" style={{ padding: 20, marginBottom: 24 }}>
          <div className="row g-3">
            <div className="col-12 col-lg-4">
              <label className="form-label" htmlFor="report-search">
                Search
              </label>
              <input
                id="report-search"
                className="form-control"
                value={filters.search}
                onChange={(event) => updateFilter('search', event.target.value)}
                placeholder="User, EV, booking or session ID"
              />
            </div>
            <div className="col-6 col-lg-2">
              <label className="form-label" htmlFor="report-date-from">
                From
              </label>
              <input
                id="report-date-from"
                type="date"
                className="form-control"
                value={filters.dateFrom}
                max={filters.dateTo || undefined}
                onChange={(event) => updateFilter('dateFrom', event.target.value)}
              />
            </div>
            <div className="col-6 col-lg-2">
              <label className="form-label" htmlFor="report-date-to">
                To
              </label>
              <input
                id="report-date-to"
                type="date"
                className="form-control"
                value={filters.dateTo}
                min={filters.dateFrom || undefined}
                onChange={(event) => updateFilter('dateTo', event.target.value)}
              />
            </div>
            <div className="col-12 col-sm-6 col-lg-2">
              <label className="form-label" htmlFor="report-session-status">
                Session Status
              </label>
              <select
                id="report-session-status"
                className="form-select"
                value={filters.sessionStatus}
                onChange={(event) => updateFilter('sessionStatus', event.target.value)}
              >
                <option value="">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
                <option value="EMERGENCY_STOPPED">Emergency Stopped</option>
              </select>
            </div>
            <div className="col-12 col-sm-6 col-lg-2">
              <label className="form-label" htmlFor="report-payment-status">
                Payment Status
              </label>
              <select
                id="report-payment-status"
                className="form-select"
                value={filters.paymentStatus}
                onChange={(event) => updateFilter('paymentStatus', event.target.value)}
              >
                <option value="">All payments</option>
                <option value="PENDING">Pending</option>
                <option value="COMPLETED">Completed</option>
                <option value="FAILED">Failed</option>
                <option value="REFUNDED">Refunded</option>
                <option value="PARTIALLY_REFUNDED">Partially Refunded</option>
              </select>
            </div>
            <div className="col-12 col-sm-6 col-lg-2">
              <label className="form-label" htmlFor="report-slot">
                Slot Number
              </label>
              <select
                id="report-slot"
                className="form-select"
                value={filters.slotNumber}
                onChange={(event) => updateFilter('slotNumber', event.target.value)}
              >
                <option value="">All slots</option>
                {slotNumbers.map((slotNumber) => (
                  <option key={slotNumber} value={slotNumber}>
                    Slot #{slotNumber}
                  </option>
                ))}
              </select>
            </div>
            <div
              className="col-12 col-sm-6 col-lg-2"
              style={{ display: 'flex', alignItems: 'flex-end' }}
            >
              <button
                type="button"
                className="btn-outline"
                onClick={clearFilters}
                style={{ width: '100%' }}
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>

        <div className="ev-card" style={{ overflow: 'hidden', position: 'relative' }}>
          {refreshing && (
            <div
              role="status"
              aria-label="Updating report"
              style={{
                position: 'absolute',
                top: 18,
                right: 20,
                color: 'var(--text-muted)',
                zIndex: 1,
              }}
            >
              <Loader2 size={16} className="spin" />
            </div>
          )}
          <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
            <h2
              style={{
                fontFamily: 'Inter',
                fontSize: '1.1rem',
                fontWeight: 700,
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Recent Charging Sessions
            </h2>
          </div>
          <div className="table-scroll">
            <table className="ev-table">
              <thead>
                <tr>
                  <th>Booking ID</th>
                  <th>Session ID</th>
                  <th>User Name</th>
                  <th>EV Model</th>
                  <th>Slot Number</th>
                  <th>Date</th>
                  <th>Start Time</th>
                  <th>End Time</th>
                  <th>Duration</th>
                  <th>Energy Delivered</th>
                  <th>Paid Amount</th>
                  <th>Refund Amount</th>
                  <th>Final Charged Amount</th>
                  <th>Payment Status</th>
                  <th>Session Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={16}>
                      <EmptyState title="No Records Found" subtitle="No sessions match these filters" />
                    </td>
                  </tr>
                ) : (
                  rows.map((booking) => (
                    <tr key={booking.id}>
                      <td style={{ fontSize: '0.78rem' }}>{booking.id}</td>
                      <td style={{ fontSize: '0.78rem' }}>{booking.sessionId}</td>
                      <td style={{ fontWeight: 500 }}>{booking.user?.name || '—'}</td>
                      <td>{booking.ev?.model || '—'}</td>
                      <td style={{ color: 'var(--primary)', fontWeight: 600 }}>
                        #{booking.slot?.slotNumber}
                      </td>
                      <td>{formatDate(booking.sessionStartTime)}</td>
                      <td>{formatTime(booking.sessionStartTime)}</td>
                      <td>{formatTime(booking.sessionEndTime)}</td>
                      <td>{formatDuration(booking.sessionDurationMinutes)}</td>
                      <td style={{ color: 'var(--accent)', fontWeight: 600 }}>
                        {formatEnergy(booking.energyDeliveredKwh)}
                      </td>
                      <td>{formatMoney(booking.paidAmount)}</td>
                      <td>{formatMoney(booking.refundAmount)}</td>
                      <td style={{ color: 'var(--warning)', fontWeight: 700 }}>
                        {formatMoney(booking.finalChargedAmount)}
                      </td>
                      <td>
                        <span className={statusClass(booking.payment?.status)}>
                          {displayStatus(booking.payment?.status)}
                        </span>
                      </td>
                      <td>
                        <span className={statusClass(booking.sessionStatus)}>
                          {displayStatus(booking.sessionStatus)}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-outline"
                          aria-label={`View booking ${booking.id}`}
                          onClick={() => openDetails(booking.id)}
                          style={{
                            minHeight: 0,
                            padding: '5px 10px',
                            fontSize: '0.72rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <Eye size={12} aria-hidden="true" /> View Details
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            page={tablePage}
            totalPages={totalPages}
            onChange={setTablePage}
            variant="table"
            total={totalRows}
            limit={ROWS_PER_PAGE}
          />
        </div>
      </motion.div>

      <Modal show={!!selectedBookingId} onClose={closeDetails} title="Session Details">
        {detailsLoading && (
          <div
            role="status"
            style={{
              minHeight: 180,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              color: 'var(--text-muted)',
            }}
          >
            <Loader2 size={18} className="spin" aria-hidden="true" />
            Loading session details...
          </div>
        )}
        {!detailsLoading && detailsError && (
          <div role="alert" style={{ textAlign: 'center', padding: '24px 0' }}>
            <p style={{ color: 'var(--text-muted)', marginBottom: 14 }}>{detailsError}</p>
            <button
              type="button"
              className="btn-outline"
              onClick={() => openDetails(selectedBookingId)}
            >
              Try Again
            </button>
          </div>
        )}
        {!detailsLoading && !detailsError && bookingDetails && (
          <BookingDetails booking={bookingDetails} />
        )}
      </Modal>
    </div>
  );
}
