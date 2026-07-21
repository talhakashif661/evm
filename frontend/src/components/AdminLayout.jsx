import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { LayoutDashboard, Users, Zap, Calendar, ScrollText, LogOut, Inbox } from 'lucide-react';
import { logoutUser } from '../store/slices/authSlice';

const navItems = [
  { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/admin/users',     icon: Users,           label: 'Users' },
  { to: '/admin/stations',  icon: Zap,             label: 'Stations' },
  { to: '/admin/bookings',  icon: Calendar,        label: 'Bookings' },
  { to: '/admin/complaints', icon: Inbox,          label: 'Complaints' },
  { to: '/admin/logs',      icon: ScrollText,      label: 'Audit Log' },
];

export default function AdminLayout() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useSelector(s => s.auth);

  const handleLogout = () => { dispatch(logoutUser()); navigate('/login'); };

  return (
    <div className="admin-layout">
      {/* Sidebar */}
      <motion.aside
        initial={{ x: -240 }} animate={{ x: 0 }} transition={{ duration: 0.4 }}
        className="admin-sidebar"
      >
        {/* Logo */}
        <div style={{ padding: '24px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Zap size={24} color="var(--primary)" />
            <div className="sidebar-label">
              <p style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 700, fontSize: '1.2rem', lineHeight: 1 }}>
                EV<span style={{ color: 'var(--primary)' }}>MGMT</span>
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.7rem', letterSpacing: '0.1em' }}>ADMIN PANEL</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '16px 0' }}>
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            >
              <item.icon size={17} style={{ width: 20 }} />
              <span className="sidebar-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User info */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'var(--primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'Inter', fontWeight: 700, fontSize: '0.9rem', color: '#ffffff', overflow: 'hidden'
            }}>
              {user?.avatar ? <img src={user.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : user?.name?.[0]?.toUpperCase()}
            </div>
            <div className="sidebar-label">
              <p style={{ fontSize: '0.82rem', fontWeight: 600, lineHeight: 1.2 }}>{user?.name}</p>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Administrator</p>
            </div>
          </div>
          <button onClick={handleLogout} className="btn-danger-sm" style={{ width: '100%', padding: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} aria-label="Sign out">
            <LogOut size={14} /><span className="sidebar-label">Sign Out</span>
          </button>
        </div>
      </motion.aside>

      {/* Main content */}
      <main className="admin-main">
        {/* Top bar */}
        <div className="admin-topbar">
          <div />
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </span>
            <span className="badge-gold">Admin</span>
          </div>
        </div>

        {/* Page content */}
        <div className="admin-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
