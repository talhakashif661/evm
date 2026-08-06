import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import {
  fetchUsers,
  toggleBlockUser as blockUser,
  deleteUser,
  promoteToAdmin,
} from '../../store/slices/adminUsersSlice';
import { SkeletonTableRows } from '../../components/Skeleton';
import { EmptyState } from '../../components/Spinner';
import Pagination from '../../components/Pagination.jsx';
import SEO from '../../components/SEO';

const roleBadge = (r) =>
  r === 'ADMIN' ? 'badge-danger' : r === 'STATION_OWNER' ? 'badge-warning' : 'badge-primary';

const ROLE_FILTERS = [
  { label: 'All Users', value: '' },
  { label: 'EV Users', value: 'EV_USER' },
  { label: 'Station Owners', value: 'STATION_OWNER' },
];

export default function AdminUsers() {
  const dispatch = useDispatch();
  const { users, loading, pagination } = useSelector((s) => s.adminUsers);
  const [page, setPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState('');

  useEffect(() => {
    dispatch(fetchUsers({ page, limit: 10, ...(roleFilter && { role: roleFilter }) }));
  }, [dispatch, page, roleFilter]);

  return (
    <div className="page-container">
      <SEO
        title="Manage Users"
        description="View all registered users, promote admins, and manage accounts across the Unified EV platform."
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

        {/* Role filter */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
          {ROLE_FILTERS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => {
                setRoleFilter(value);
                setPage(1);
              }}
              style={{
                padding: '6px 16px',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: '0.82rem',
                fontWeight: 600,
                background: roleFilter === value ? 'var(--gold)' : 'var(--bg-card)',
                border: `1px solid ${roleFilter === value ? 'var(--gold)' : 'var(--border)'}`,
                color: roleFilter === value ? 'var(--on-dark)' : 'var(--text-secondary)',
                transition: 'background-color 0.12s ease, border-color 0.12s ease',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="ev-card" style={{ overflow: 'hidden' }}>
          <div className="table-scroll">
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
                {loading ? (
                  <SkeletonTableRows rows={6} columns={8} />
                ) : !users || users.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <EmptyState title="No Records Found" subtitle="No users to show yet." />
                    </td>
                  </tr>
                ) : (
                  users.map((u, i) => (
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
