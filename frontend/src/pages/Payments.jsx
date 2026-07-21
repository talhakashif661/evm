import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { CreditCard, Receipt, CheckCircle2, Clock, XCircle, RotateCcw } from 'lucide-react';
import { fetchPayments } from '../store/slices/bookingSlice';
import { EmptyState } from '../components/Spinner';
import { Skeleton } from '../components/Skeleton';
import { toPKR } from '../utils/pkr';
import SEO from '../components/SEO';

// Mirrors the PaymentStatus enum in prisma/schema.prisma
const STATUS_META = {
  COMPLETED: { color: 'var(--success)', bg: '#E3EDE5', border: '#BFD6C5', icon: CheckCircle2 },
  PENDING:   { color: 'var(--warning)', bg: '#F1E3D3', border: '#DEC49E', icon: Clock },
  FAILED:    { color: 'var(--danger)',  bg: '#F3E1DE', border: '#E0BAB4', icon: XCircle },
  REFUNDED:  { color: 'var(--info)',    bg: '#DEE6EC', border: '#B9C7D3', icon: RotateCcw },
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.PENDING;
  const Icon = meta.icon;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: meta.bg, color: meta.color,
      border: `1px solid ${meta.border}`,
      padding: '3px 10px', borderRadius: 4,
      fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.04em'
    }}>
      <Icon size={12} /> {status}
    </span>
  );
}

export default function Payments() {
  const dispatch = useDispatch();
  const { payments, paymentsLoading } = useSelector(s => s.bookings);

  useEffect(() => {
    dispatch(fetchPayments());
  }, [dispatch]);

  const totalPaid = payments
    .filter(p => p.status === 'COMPLETED')
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '44px 32px' }}>
      <SEO
        title="Payment History"
        description="View your ChargeEV payment history, receipts, and transaction status for all your charging sessions."
        noIndex
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16, marginBottom: 28 }}>
        <div>
          <h1 className="section-title">Payment <span>History</span></h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Every payment you&apos;ve made for completed charging sessions</p>
        </div>
        {!paymentsLoading && payments.length > 0 && (
          <div className="ev-card" style={{ padding: '12px 20px', textAlign: 'right' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Paid</p>
            <p style={{ fontFamily: 'Inter', fontSize: '1.5rem', fontWeight: 700, color: 'var(--primary-dark)', lineHeight: 1.1 }}>
              {toPKR(totalPaid)}
            </p>
          </div>
        )}
      </div>

      {paymentsLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="ev-card" style={{ padding: 20 }}>
              <Skeleton height={18} width="45%" style={{ marginBottom: 10 }} />
              <Skeleton height={13} width="65%" />
            </div>
          ))}
        </div>
      ) : payments.length === 0 ? (
        <EmptyState
          icon={<Receipt size={48} color="var(--text-muted)" strokeWidth={1.5} />}
          title="No payments yet"
          subtitle="When you pay for a completed charging session, it will show up here."
        />
      ) : (
        <div className="ev-card" style={{ padding: 0, overflowX: 'auto' }}>
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
              {payments.map((p, i) => (
                <motion.tr key={p.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}>
                  <td style={{ whiteSpace: 'nowrap' }}>{new Date(p.createdAt).toLocaleString()}</td>
                  <td style={{ fontWeight: 600 }}>{p.booking?.slot?.station?.name || '—'}</td>
                  <td>#{p.booking?.slot?.slotNumber ?? '—'}</td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                      <CreditCard size={13} /> {p.method}
                    </span>
                  </td>
                  <td><StatusBadge status={p.status} /></td>
                  <td style={{ textAlign: 'right', fontFamily: 'Inter', fontWeight: 700, color: 'var(--primary-dark)' }}>
                    {toPKR(p.amount)}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
