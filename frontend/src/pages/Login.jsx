import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { loginUser } from '../store/slices/authSlice';
import SEO from '../components/SEO';

export default function Login() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { loading } = useSelector((s) => s.auth);
  const [form, setForm] = useState({ email: '', password: '' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const res = await dispatch(loginUser(form));
    if (!res.error) {
      const role = res.payload?.data?.user?.role;
      if (role === 'ADMIN') navigate('/admin/dashboard');
      else navigate('/dashboard');
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'var(--bg-page)',
      }}
    >
      <SEO
        title="Log In"
        description="Log in to your ChargeEV account to book charging stations, track your sessions, and manage your EVs."
        noIndex
      />
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ width: '100%', maxWidth: 420 }}
      >
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 60,
              height: 60,
              borderRadius: 16,
              background: 'var(--primary-glow)',
              border: '1px solid var(--border-hover)',
              marginBottom: 16,
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="var(--primary)">
              <path d="M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z" />
            </svg>
          </div>
          <h1
            style={{
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontSize: '2.4rem',
              fontWeight: 700,
              letterSpacing: '0.02em',
              marginBottom: 8,
            }}
          >
            Welcome <span style={{ color: 'var(--primary)' }}>Back</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            Sign in to EV Management System
          </p>
        </div>

        <div className="ev-card" style={{ padding: 32 }}>
          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label className="form-label" htmlFor="login-email">
                Email Address
              </label>
              <input
                id="login-email"
                type="email"
                className="form-control"
                placeholder="you@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div className="mb-4">
              <label className="form-label" htmlFor="login-password">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                className="form-control"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
              <div style={{ textAlign: 'right', marginTop: 8 }}>
                <Link
                  to="/forgot-password"
                  style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textDecoration: 'none' }}
                >
                  Forgot password?
                </Link>
              </div>
            </div>
            <button
              type="submit"
              className="btn-gold w-100"
              style={{ padding: '13px', fontSize: '1rem' }}
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div style={{ marginTop: 24, textAlign: 'center' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
              Don&apos;t have an account?{' '}
              <Link
                to="/register"
                style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}
              >
                Sign up first
              </Link>
            </p>
          </div>

          {/* Admin Access note */}
          <div
            style={{
              marginTop: 20,
              padding: '12px 16px',
              background: '#DEE6EC',
              border: '1px solid #B9C7D3',
              borderRadius: 4,
              textAlign: 'center',
            }}
          >
            <p style={{ color: 'var(--accent)', fontSize: '0.82rem', fontWeight: 600 }}>
              Admin Access
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: 2 }}>
              Admin users are redirected to the admin dashboard automatically after login.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
