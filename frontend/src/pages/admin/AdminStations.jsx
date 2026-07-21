import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { fetchAdminStations as fetchStations, updateStationStatus } from '../../store/slices/adminStationsSlice';
import { toPKR } from '../../utils/pkr';
import { SkeletonRow } from '../../components/Skeleton';
import SEO from '../../components/SEO';

const statusBadge = s => s==='APPROVED'?'badge-success':s==='PENDING'?'badge-warning':s==='REJECTED'?'badge-danger':'badge-info';

export default function AdminStations() {
  const dispatch = useDispatch();
  const { stations, loading, pagination } = useSelector(s => s.adminStations);
  const [page, setPage] = useState(1);

  useEffect(() => { dispatch(fetchStations({ page, limit: 20 })); }, [dispatch, page]);

  return (
    <div className="page-container">
      <SEO
        title="Manage Stations"
        description="Approve, review, and manage EV charging station listings across the ChargeEV platform."
        noIndex
      />
      <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }}>
        <div style={{ marginBottom:24 }}>
          <h1 style={{ fontFamily:'Georgia, "Times New Roman", serif', fontSize:'2.6rem', fontWeight:700, letterSpacing:'0.02em' }}>
            Manage <span style={{ color:'var(--primary)' }}>Stations</span>
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
                  <tr><th>#</th><th>Station</th><th>Owner</th><th>City</th><th>Price/kWh</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {(stations||[]).map((s,i) => (
                    <tr key={s.id}>
                      <td style={{ color:'var(--text-muted)', fontSize:'0.8rem' }}>{i+1}</td>
                      <td>
                        <p style={{ fontWeight:600, fontSize:'0.88rem' }}>{s.name}</p>
                        <p style={{ color:'var(--text-muted)', fontSize:'0.74rem' }}>{s.address}</p>
                      </td>
                      <td style={{ color:'var(--text-secondary)', fontSize:'0.85rem' }}>{s.owner?.name}</td>
                      <td style={{ color:'var(--text-secondary)', fontSize:'0.85rem' }}>{s.city}</td>
                      <td style={{ color:'var(--warning)', fontWeight:700, fontFamily:'Inter' }}>
                        {toPKR(s.pricePerKwh)}/kWh
                      </td>
                      <td><span className={statusBadge(s.status)}>{s.status}</span></td>
                      <td>
                        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                          {s.status !== 'APPROVED' && (
                            <button className="btn-success-sm"
                              onClick={() => dispatch(updateStationStatus({ id:s.id, action:'APPROVED' }))}>
                              Approve
                            </button>
                          )}
                          {s.status !== 'REJECTED' && (
                            <button className="btn-danger-sm"
                              onClick={() => dispatch(updateStationStatus({ id:s.id, action:'REJECTED' }))}>
                              Reject
                            </button>
                          )}
                        </div>
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
