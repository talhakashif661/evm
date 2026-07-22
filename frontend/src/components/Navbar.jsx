import { useState } from 'react';
import { Link, NavLink as RouterNavLink, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, X, ArrowRight, Zap } from 'lucide-react';
import { logoutUser } from '../store/slices/authSlice';

const Logo = () => (
  <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
    <div
      style={{
        width: 38,
        height: 38,
        borderRadius: 8,
        background: 'var(--primary-glow)',
        border: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Zap size={19} color="var(--primary)" fill="var(--primary)" strokeWidth={1} />
    </div>
    <span
      style={{
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontWeight: 700,
        fontSize: '1.25rem',
        color: 'var(--text-light)',
        letterSpacing: '0.02em',
      }}
    >
      Charge<span style={{ color: 'var(--accent-gold)' }}>EV</span>
    </span>
  </Link>
);

export default function Navbar() {
  const { user, token } = useSelector((s) => s.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    dispatch(logoutUser());
    setMenuOpen(false);
    navigate('/login');
  };

  const userLinks = [
    ['/dashboard', 'Dashboard'],
    ['/stations', 'Stations'],
    ['/bookings', 'Bookings'],
    ['/payments', 'Payments'],
    ['/history', 'History'],
    ['/evs', 'My EVs'],
    ['/auction', 'Auction'],
  ];
  const ownerLinks = [
    ['/dashboard', 'Dashboard'],
    ['/owner/station', 'My Station'],
    ['/owner/reports', 'Reports'],
  ];
  const adminLinks = [
    ['/admin/dashboard', 'Dashboard'],
    ['/admin/users', 'Users'],
    ['/admin/stations', 'Stations'],
    ['/admin/bookings', 'Bookings'],
  ];
  const publicLinks = [
    ['/', 'Home'],
    ['/stations', 'Stations'],
    ['/about', 'About'],
    ['/contact', 'Contact'],
  ];

  const links = !token
    ? publicLinks
    : user?.role === 'ADMIN'
      ? adminLinks
      : user?.role === 'STATION_OWNER'
        ? ownerLinks
        : userLinks;

  return (
    <nav className="navbar-root">
      <div className="navbar-inner">
        <Logo />

        {/* Desktop links */}
        <div className="navbar-desktop-links">
          {links.map(([to, label]) => (
            <RouterNavLink key={to} to={to} end={to === '/'} className="navbar-link">
              {label}
            </RouterNavLink>
          ))}
        </div>

        {/* Right side (desktop) */}
        <div
          className="navbar-desktop-right"
          style={{ display: 'flex', alignItems: 'center', gap: 12 }}
        >
          {token ? (
            <>
              <span
                style={{
                  fontSize: '0.7rem',
                  padding: '3px 10px',
                  borderRadius: 4,
                  background:
                    user?.role === 'ADMIN'
                      ? 'var(--danger-tint)'
                      : user?.role === 'STATION_OWNER'
                        ? 'var(--warning-tint)'
                        : 'var(--primary-glow)',
                  color:
                    user?.role === 'ADMIN'
                      ? 'var(--danger)'
                      : user?.role === 'STATION_OWNER'
                        ? 'var(--warning)'
                        : 'var(--primary-dark)',
                  border: `1px solid ${user?.role === 'ADMIN' ? 'var(--danger-tint-border)' : user?.role === 'STATION_OWNER' ? 'var(--warning-tint-border)' : 'var(--border)'}`,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {user?.role?.replace('_', ' ')}
              </span>

              <Link
                to="/profile"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  color: 'var(--text-light)',
                  textDecoration: 'none',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                }}
              >
                {user?.avatar ? (
                  <img
                    src={user.avatar}
                    alt=""
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: '50%',
                      objectFit: 'cover',
                      border: '1px solid var(--border-hover)',
                    }}
                  />
                ) : (
                  <span
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: '50%',
                      background: 'var(--primary-glow)',
                      color: 'var(--primary-dark)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: 'Inter',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                    }}
                  >
                    {user?.name?.[0]?.toUpperCase()}
                  </span>
                )}
                {user?.name?.split(' ')[0]}
              </Link>

              <button
                onClick={handleLogout}
                style={{
                  background: 'var(--danger-tint)',
                  border: '1px solid var(--danger-tint-border)',
                  color: 'var(--danger)',
                  padding: '6px 14px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontFamily: 'Inter',
                  fontWeight: 700,
                  letterSpacing: '0.02em',
                }}
              >
                LOGOUT
              </button>
            </>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <Link to="/login" className="nav-cta-outline">
                Login
              </Link>
              <Link to="/register" className="nav-cta-solid">
                Register
              </Link>
            </div>
          )}
        </div>

        {/* Hamburger */}
        <button
          className="navbar-hamburger"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={menuOpen ? 'x' : 'menu'}
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.15 }}
              style={{ display: 'flex' }}
            >
              {menuOpen ? <X size={24} /> : <Menu size={24} />}
            </motion.span>
          </AnimatePresence>
        </button>
      </div>

      {/* Mobile slide-down menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className="navbar-mobile-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
          >
            <div className="navbar-mobile-links">
              {links.map(([to, label]) => (
                <RouterNavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) => (isActive ? 'active' : '')}
                >
                  {label}
                </RouterNavLink>
              ))}
              {token ? (
                <>
                  <RouterNavLink to="/profile" onClick={() => setMenuOpen(false)}>
                    My Profile
                  </RouterNavLink>
                  <button onClick={handleLogout} style={{ color: 'var(--danger)' }}>
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <RouterNavLink to="/login" onClick={() => setMenuOpen(false)}>
                    Login
                  </RouterNavLink>
                  <RouterNavLink
                    to="/register"
                    onClick={() => setMenuOpen(false)}
                    style={{
                      color: 'var(--primary-dark)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    Register <ArrowRight size={15} />
                  </RouterNavLink>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Unverified banner */}
      {token && user && !user.isVerified && (
        <div
          style={{
            background: 'var(--warning-tint)',
            borderTop: '1px solid var(--warning-tint-border)',
            padding: '7px 24px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ color: 'var(--warning)', fontSize: '0.82rem' }}>
            Verify your email to unlock all features
          </span>
          <Link
            to="/verify-email"
            style={{
              color: 'var(--primary-dark)',
              fontSize: '0.82rem',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            Verify Now <ArrowRight size={14} />
          </Link>
        </div>
      )}
    </nav>
  );
}
