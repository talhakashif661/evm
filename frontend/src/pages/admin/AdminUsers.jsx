import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import {
  fetchUsers,
  toggleBlockUser as blockUser,
  deleteUser,
  promoteToAdmin,
} from '../../store/slices/adminUsersSlice';
import { SkeletonRow } from '../../components/Skeleton';
import SEO from '../../components/SEO';

const roleBadge = (r) =>
  r === 'ADMIN' ? 'badge-danger' : r === 'STATION_OWNER' ? 'badge-warning' : 'badge-primary';

export default function AdminUsers() {
  const dispatch = useDispatch();
  const { users, loading, pagination } = useSelector((s) => s.adminUsers);
  const [page, setPage] = useState(1);

  useEffect(() => {
    dispatch(fetchUsers({ page, limit: 20 }));
  }, [dispatch, page]);

  return (
    <div className="page-container">
      <SEO
        title="Manage Users"
        description="View all registered users, promote admins, and manage accounts across the ChargeEV platform."
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
            Manage <span style={{ color: 'var(--primary)' }}>Users</span>
          </h1>
        </div>

        {loading ? (
          <div className="ev-card" style={{ padding: '8px 20px' }}>
            {[...Array(6)].map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : (
          <>
            <div className="ev-card" style={{ overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="ev-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Verified</th>
                      <th>Blocked</th>
                      <th>Joined</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(users || []).map((u, i) => (
                      <tr key={u.id}>
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{i + 1}</td>
                        <td style={{ fontWeight: 500 }}>{u.name}</td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                          {u.email}
                        </td>
                        <td>
                          <span className={roleBadge(u.role)}>{u.role}</span>
                        </td>
                        <td>
                          <span
                            style={{
                              color: u.isVerified ? 'var(--success)' : 'var(--danger)',
                              fontWeight: 600,
                              fontSize: '0.82rem',
                            }}
                          >
                            {u.isVerified ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td>
                          <span
                            style={{
                              color: u.isBlocked ? 'var(--danger)' : 'var(--success)',
                              fontWeight: 600,
                              fontSize: '0.82rem',
                            }}
                          >
                            {u.isBlocked ? 'Blocked' : 'Active'}
                          </span>
                        </td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                          {new Date(u.createdAt).toLocaleDateString('en-PK')}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {u.role !== 'ADMIN' && (
                              <button
                                className="btn-success-sm"
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      `Promote ${u.name} to Admin? This cannot be undone from here.`
                                    )
                                  )
                                    dispatch(promoteToAdmin(u.id));
                                }}
                              >
                                Promote to Admin
                              </button>
                            )}
                            <button
                              className="btn-outline"
                              style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                              onClick={() => dispatch(blockUser(u.id))}
                            >
                              {u.isBlocked ? 'Unblock' : 'Block'}
                            </button>
                            <button
                              className="btn-danger-sm"
                              onClick={() => {
                                const warning =
                                  u.role === 'STATION_OWNER'
                                    ? `Delete ${u.name}? This also deletes their station and every slot on it — which cascades to CANCEL other customers' bookings, payments, and reviews at that station. This cannot be undone.`
                                    : `Delete ${u.name}? This also deletes all their EVs, bookings, bids, reviews, and payment history. This cannot be undone.`;
                                if (window.confirm(warning)) dispatch(deleteUser(u.id));
                              }}
                            >
                              Delete
                            </button>
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
                <button
                  className="btn-outline"
                  style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </button>
                <span
                  style={{
                    alignSelf: 'center',
                    color: 'var(--text-secondary)',
                    fontSize: '0.85rem',
                  }}
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
      </motion.div>
    </div>
  );
}
