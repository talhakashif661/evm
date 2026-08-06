import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import {
  fetchAdminStations as fetchStations,
  updateStationStatus,
  fetchStationUpdateRequests,
  reviewStationUpdateRequest,
} from '../../store/slices/adminStationsSlice';
import { toPKR } from '../../utils/pkr';
import { SkeletonTableRows } from '../../components/Skeleton';
import { EmptyState } from '../../components/Spinner';
import Pagination from '../../components/Pagination.jsx';
import SEO from '../../components/SEO';

const GATED_LABELS = {
  address: 'Address',
  city: 'City',
  latitude: 'Latitude',
  longitude: 'Longitude',
  pricePerKwh: 'Price/kWh',
};

function RequestedChanges({ request }) {
  const fields = Object.keys(GATED_LABELS).filter((f) => request[f] != null);
  return (
    <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.82rem' }}>
      {fields.map((f) => (
        <li key={f}>
          <strong>{GATED_LABELS[f]}:</strong>{' '}
          <span style={{ color: 'var(--text-muted)' }}>
            {f === 'pricePerKwh' ? toPKR(request.station[f]) : String(request.station[f])}
          </span>{' '}
          →{' '}
          <span style={{ color: 'var(--primary)', fontWeight: 600 }}>
            {f === 'pricePerKwh' ? toPKR(request[f]) : String(request[f])}
          </span>
        </li>
      ))}
    </ul>
  );
}

const statusBadge = (s) =>
  s === 'APPROVED'
    ? 'badge-success'
    : s === 'PENDING'
      ? 'badge-warning'
      : s === 'REJECTED'
        ? 'badge-danger'
        : 'badge-info';

export default function AdminStations() {
  const dispatch = useDispatch();
  const { stations, loading, pagination, updateRequests, updateRequestsLoading } = useSelector(
    (s) => s.adminStations
  );
  const [page, setPage] = useState(1);

  useEffect(() => {
    dispatch(fetchStations({ page, limit: 10 }));
  }, [dispatch, page]);

  useEffect(() => {
    dispatch(fetchStationUpdateRequests());
  }, [dispatch]);

  return (
    <div className="page-container">
      <SEO
        title="Manage Stations"
        description="Approve, review, and manage EV charging station listings across the Unified EV platform."
        noIndex
      />
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div style={{ marginBottom: 24 }}>
          <h1
            style={{
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontSize: '2.6rem',
              fontWeight: 700,
              letterSpacing: '0.02em',
            }}
          >
            Manage <span style={{ color: 'var(--primary)' }}>Stations</span>
          </h1>
        </div>

        {!updateRequestsLoading && updateRequests.length > 0 && (
          <div className="ev-card" style={{ padding: 20, marginBottom: 24 }}>
            <h2
              style={{
                fontSize: '1.1rem',
                fontWeight: 700,
                marginBottom: 14,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              Pending Address/Price Changes
              <span className="badge-warning">{updateRequests.length}</span>
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {updateRequests.map((r) => (
                <div
                  key={r.id}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: 14,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 16,
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <p style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 2 }}>
                      {r.station.name}
                    </p>
                    <p
                      style={{
                        color: 'var(--text-muted)',
                        fontSize: '0.76rem',
                        marginBottom: 10,
                      }}
                    >
                      Owner: {r.station.owner?.name} ({r.station.owner?.email})
                    </p>
                    <RequestedChanges request={r} />
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      className="btn-success-sm"
                      onClick={() =>
                        dispatch(reviewStationUpdateRequest({ id: r.id, action: 'APPROVED' }))
                      }
                    >
                      Approve
                    </button>
                    <button
                      className="btn-danger-sm"
                      onClick={() => {
                        const adminNote = window.prompt('Optional note for the owner (why this was rejected):') || '';
                        dispatch(reviewStationUpdateRequest({ id: r.id, action: 'REJECTED', adminNote }));
                      }}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="ev-card" style={{ overflow: 'hidden' }}>
          <div className="table-scroll">
            <table className="ev-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Station</th>
                  <th>Owner</th>
                  <th>City</th>
                  <th>Price/kWh</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <SkeletonTableRows rows={6} columns={7} />
                ) : !stations || stations.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <EmptyState title="No Records Found" subtitle="No stations to show yet." />
                    </td>
                  </tr>
                ) : (
                  stations.map((s, i) => (
                      <tr key={s.id}>
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{i + 1}</td>
                        <td>
                          <p style={{ fontWeight: 600, fontSize: '0.88rem' }}>{s.name}</p>
                          <p style={{ color: 'var(--text-muted)', fontSize: '0.74rem' }}>
                            {s.address}
                          </p>
                        </td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                          {s.owner?.name}
                        </td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                          {s.city}
                        </td>
                        <td
                          style={{ color: 'var(--warning)', fontWeight: 700, fontFamily: 'Inter' }}
                        >
                          {toPKR(s.pricePerKwh)}/kWh
                        </td>
                        <td>
                          <span className={statusBadge(s.status)}>{s.status}</span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {s.status !== 'APPROVED' && (
                              <button
                                className="btn-success-sm"
                                onClick={() =>
                                  dispatch(updateStationStatus({ id: s.id, action: 'APPROVED' }))
                                }
                              >
                                Approve
                              </button>
                            )}
                            {s.status !== 'REJECTED' && (
                              <button
                                className="btn-danger-sm"
                                onClick={() =>
                                  dispatch(updateStationStatus({ id: s.id, action: 'REJECTED' }))
                                }
                              >
                                Reject
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <Pagination
          page={page}
          totalPages={pagination?.pages}
          onChange={setPage}
          variant="standalone"
          total={pagination?.total}
          limit={10}
        />
      </motion.div>
    </div>
  );
}
