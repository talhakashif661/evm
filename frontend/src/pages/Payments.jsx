import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { CreditCard, Receipt, CheckCircle2, Clock, XCircle, RotateCcw } from 'lucide-react';
import { fetchPayments } from '../store/slices/bookingSlice';
import { EmptyState } from '../components/Spinner';
import { SkeletonTableRows } from '../components/Skeleton';
import { toPKR } from '../utils/pkr';
import api from '../utils/api';
import { logger } from '../utils/logger';
import SEO from '../components/SEO';
import Pagination from '../components/Pagination.jsx';

// Mirrors the PaymentStatus enum in prisma/schema.prisma
const STATUS_META = {
  COMPLETED: {
    color: 'var(--success)',
    bg: 'var(--success-tint)',
    border: 'var(--success-tint-border)',
    icon: CheckCircle2,
  },
  PENDING: {
    color: 'var(--warning)',
    bg: 'var(--warning-tint)',
    border: 'var(--warning-tint-border)',
    icon: Clock,
  },
  FAILED: {
    color: 'var(--danger)',
    bg: 'var(--danger-tint)',
    border: 'var(--danger-tint-border)',
    icon: XCircle,
  },
  REFUNDED: {
    color: 'var(--info)',
    bg: 'var(--info-tint)',
    border: 'var(--info-tint-border)',
    icon: RotateCcw,
  },
  PARTIALLY_REFUNDED: {
    color: 'var(--info)',
    bg: 'var(--info-tint)',
    border: 'var(--info-tint-border)',
    icon: RotateCcw,
  },
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.PENDING;
  const Icon = meta.icon;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        background: meta.bg,
        color: meta.color,
        border: `1px solid ${meta.border}`,
        padding: '3px 10px',
        borderRadius: 4,
        fontSize: '0.72rem',
        fontWeight: 700,
        letterSpacing: '0.04em',
      }}
    >
      <Icon size={12} /> {status.replace(/_/g, ' ')}
    </span>
  );
}

export default function Payments() {
  const dispatch = useDispatch();
  const { payments, paymentsLoading, paymentsPagination } = useSelector((s) => s.bookings);
  const [page, setPage] = useState(1);
  const [totalPaid, setTotalPaid] = useState(0);

  useEffect(() => {
    dispatch(fetchPayments({ page, limit: 10 }));
  }, [dispatch, page]);

  // Total Paid must reflect the user's ENTIRE payment history, not just the
  // current 10-row page — fetched separately so pagination doesn't skew it,
  // same approach as UserHistory.jsx's stats fetch.
  useEffect(() => {
    const fetchTotal = async () => {
      try {
        const res = await api.get('/payments/history', { params: { page: 1, limit: 1000 } });
        const all = res.data.data || [];
        setTotalPaid(
          all.reduce((sum, p) => {
            if (p.status === 'COMPLETED') return sum + (p.amount || 0);
            if (p.status === 'PARTIALLY_REFUNDED')
              return sum + (p.amount || 0) - (p.refundedAmount || 0);
            return sum;
          }, 0)
        );
      } catch (e) {
        logger.error(e);
      }
    };
    fetchTotal();
  }, []);

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '44px 32px' }}>
      <SEO
        title="Payment History"
        description="View your Unified EV payment history, receipts, and transaction status for all your charging sessions."
        noIndex
      />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          flexWrap: 'wrap',
          gap: 16,
          marginBottom: 28,
        }}
      >
        <div>
          <h1 className="section-title">
            Payment <span>History</span>
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Every payment you&apos;ve made for completed charging sessions
          </p>
        </div>
        {!paymentsLoading && paymentsPagination?.total > 0 && (
          <div className="ev-card" style={{ padding: '12px 20px', textAlign: 'right' }}>
            <p
              style={{
                color: 'var(--text-muted)',
                fontSize: '0.72rem',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Total Paid
            </p>
            <p
              style={{
                fontFamily: 'Inter',
                fontSize: '1.5rem',
                fontWeight: 700,
                color: 'var(--primary-dark)',
                lineHeight: 1.1,
              }}
            >
              {toPKR(totalPaid)}
            </p>
          </div>
        )}
      </div>

      {!paymentsLoading && payments.length === 0 ? (
        <EmptyState
          icon={<Receipt size={48} color="var(--text-muted)" strokeWidth={1.5} />}
          title="No payments yet"
          subtitle="When you pay for a completed charging session, it will show up here."
        />
      ) : (
        <>
        <div className="ev-card" style={{ padding: 0 }}>
        <div className="table-scroll">
          <table className="ev-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Station</th>
                <th>Slot</th>
                <th>Method</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {paymentsLoading ? (
                <SkeletonTableRows rows={5} columns={6} />
              ) : (
                payments.map((p, i) => (
                <motion.tr
                  key={p.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <td style={{ whiteSpace: 'nowrap' }}>{new Date(p.createdAt).toLocaleString()}</td>
                  <td style={{ fontWeight: 600 }}>{p.booking?.slot?.station?.name || '—'}</td>
                  <td>#{p.booking?.slot?.slotNumber ?? '—'}</td>
                  <td>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        color: 'var(--text-secondary)',
                        fontSize: '0.82rem',
                      }}
                    >
                      <CreditCard size={13} /> {p.method}
                    </span>
                  </td>
                  <td>
                    <StatusBadge status={p.status} />
                  </td>
                  <td
                    style={{
                      textAlign: 'right',
                      fontFamily: 'Inter',
                      fontWeight: 700,
                      color: 'var(--primary-dark)',
                    }}
                  >
                    {toPKR(p.amount)}
                    {p.refundedAmount ? (
                      <div
                        style={{ fontSize: '0.72rem', fontWeight: 500, color: 'var(--text-muted)' }}
                      >
                        {toPKR(p.refundedAmount)} refunded
                      </div>
                    ) : null}
                  </td>
                </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        </div>
        <Pagination
          page={page}
          totalPages={paymentsPagination?.pages}
          onChange={setPage}
          variant="standalone"
          total={paymentsPagination?.total}
          limit={10}
        />
        </>
      )}
    </div>
  );
}
