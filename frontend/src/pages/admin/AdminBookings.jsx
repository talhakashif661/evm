import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { fetchAdminBookings as fetchBookings, cancelAdminBooking } from '../../store/slices/adminBookingsSlice';
import { toPKR } from '../../utils/pkr';
import { SkeletonRow } from '../../components/Skeleton';
import SEO from '../../components/SEO';

const statusBadge = s => ({ COMPLETED:'badge-success', CONFIRMED:'badge-primary', ACTIVE:'badge-warning', CANCELLED:'badge-danger', PENDING:'badge-info' }[s]||'badge-info');
// Mirrors ownerCancelBooking's own allowed-status gate (booking.controller.js).
const CANCELLABLE = ['CONFIRMED', 'CHECKED_IN', 'ACTIVE'];

export default function AdminBookings() {
  const dispatch = useDispatch();
  const { bookings, loading, pagination } = useSelector(s => s.adminBookings);
  const [page, setPage] = useState(1);

  useEffect(() => { dispatch(fetchBookings({ page, limit: 20 })); }, [dispatch, page]);

  const handleCancel = (id) => {
    if (!window.confirm('Cancel this booking? If the customer already paid, they will be refunded automatically.')) return;
    dispatch(cancelAdminBooking(id));
  };

  return (
    <div className="page-container">
      <SEO
        title="Manage Bookings"
        description="View and monitor all EV charging bookings across the ChargeEV platform."
        noIndex
      />
      <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }}>
        <div style={{ marginBottom:24 }}>
          <h1 style={{ fontFamily:'Georgia, "Times New Roman", serif', fontSize:'2.6rem', fontWeight:700, letterSpacing:'0.02em' }}>
            All <span style={{ color:'var(--primary)' }}>Bookings</span>
          </h1>
        </div>

        {loading ? (
          <div className="ev-card" style={{ padding: '8px 20px' }}>
            {[...Array(6)].map((_, i) => <SkeletonRow key={i} />)}
          </div>
        ) : (
          <>
          <div className="ev-card" style={{ overflow:'hidden' }}>
            <div style={{ overflowX:'auto' }}>
              <table className="ev-table">
                <thead>
                  <tr><th>#</th><th>User</th><th>Station</th><th>Slot</th><th>Start</th><th>Cost</th><th>Payment</th><th>Status</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {(bookings||[]).map((b,i) => (
                    <tr key={b.id}>
                      <td style={{ color:'var(--text-muted)', fontSize:'0.8rem' }}>{i+1}</td>
                      <td>
                        <p style={{ fontWeight:500, fontSize:'0.88rem' }}>{b.user?.name}</p>
                        <p style={{ color:'var(--text-muted)', fontSize:'0.74rem' }}>{b.user?.email}</p>
                      </td>
                      <td style={{ color:'var(--text-secondary)', fontSize:'0.85rem' }}>{b.slot?.station?.name||'—'}</td>
                      <td style={{ color:'var(--primary)', fontWeight:600 }}>#{b.slot?.slotNumber}</td>
                      <td style={{ color:'var(--text-muted)', fontSize:'0.82rem' }}>
                        {new Date(b.startTime).toLocaleDateString('en-PK')}
                      </td>
                      <td style={{ color:'var(--warning)', fontWeight:700, fontFamily:'Inter' }}>
                        {b.totalCost ? toPKR(b.totalCost) : '—'}
                      </td>
                      <td>
                        {b.status === 'COMPLETED'
                          ? (b.payment ? <span className="badge-success">Paid</span> : <span className="badge-danger">Unpaid</span>)
                          : '—'}
                      </td>
                      <td><span className={statusBadge(b.status)}>{b.status}</span></td>
                      <td>
                        {CANCELLABLE.includes(b.status) && (
                          <button className="btn-danger-sm" onClick={() => handleCancel(b.id)}>Cancel</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {pagination && pagination.pages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
              <button className="btn-outline" style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                Previous
              </button>
              <span style={{ alignSelf: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                Page {pagination.page} of {pagination.pages}
              </span>
              <button className="btn-outline" style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)}>
                Next
              </button>
            </div>
          )}
          </>
        )}
      </motion.div>
    </div>
  );
}
