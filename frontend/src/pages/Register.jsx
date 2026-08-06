import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { registerUser } from '../store/slices/authSlice';
import { PasswordStrengthBar } from '../components/PasswordStrengthBar';
import SEO from '../components/SEO';

const roles = [
  {
    value: 'EV_USER',
    label: 'EV User',
    desc: 'Book charging slots & bid in auctions',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2a5 5 0 1 1 0 10A5 5 0 0 1 12 2zm0 12c5.33 0 8 2.67 8 4v2H4v-2c0-1.33 2.67-4 8-4z" />
      </svg>
    ),
  },
  {
    value: 'STATION_OWNER',
    label: 'Station Owner',
    desc: 'List & manage your charging station',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M2 20V8l10-6 10 6v12H2zm10-2a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
      </svg>
    ),
  },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Register() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { loading } = useSelector((s) => s.auth);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [form, setForm] = useState({ email: '', password: '', role: 'EV_USER', phone: '' });
  const [confirmPassword, setConfirmPassword] = useState('');
  const [touched, setTouched] = useState({});
  const markTouched = (field) => setTouched((t) => ({ ...t, [field]: true }));

  const errors = {
    firstName: touched.firstName && !firstName.trim() ? 'First name is required' : '',
    email:
      touched.email && form.email && !EMAIL_RE.test(form.email)
        ? 'Enter a valid email address'
        : '',
    password:
      touched.password && form.password && form.password.length < 6
        ? 'Must be at least 6 characters'
        : '',
    confirmPassword:
      touched.confirmPassword && confirmPassword && confirmPassword !== form.password
        ? "Passwords don't match"
        : '',
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched({ firstName: true, email: true, password: true, confirmPassword: true });
    if (
      !firstName.trim() ||
      !EMAIL_RE.test(form.email) ||
      form.password.length < 6 ||
      confirmPassword !== form.password
    ) {
      return;
    }
    // First/last name are kept as separate fields the whole time the user is
    // typing, and only combined once, on submit, into the single `name`
    // field the API expects. This avoids the old split/join-on-every-keystroke
    // bug where fast typing or extra spaces could scramble the name.
    const name = `${firstName.trim()} ${lastName.trim()}`.trim();
    const res = await dispatch(registerUser({ ...form, name }));
    if (!res.error) {
      navigate('/dashboard');
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
        title="Create an Account"
        description="Create a free Unified EV account to book EV charging stations, list your own charging station, or manage your EV fleet."
        noIndex
      />
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ width: '100%', maxWidth: 500 }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
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
              marginBottom: 6,
            }}
          >
            Register <span style={{ color: 'var(--primary)' }}>As</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>Join Unified EV</p>
        </div>

        <div className="ev-card" style={{ padding: 32 }}>
          {/* Role selector - matches screenshot style */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
            {roles.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setForm({ ...form, role: r.value })}
                style={{
                  flex: 1,
                  padding: '10px 6px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  textAlign: 'center',
                  background: form.role === r.value ? 'var(--primary-glow)' : 'var(--bg-elevated)',
                  border: `1px solid ${form.role === r.value ? 'var(--primary)' : 'var(--border)'}`,
                  color: form.role === r.value ? 'var(--primary)' : 'var(--text-secondary)',
                  transition: 'all 0.2s',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span style={{ opacity: form.role === r.value ? 1 : 0.5 }}>{r.icon}</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, fontFamily: 'Inter' }}>
                  {r.label}
                </span>
              </button>
            ))}
          </div>

          <p
            style={{
              color: 'var(--text-muted)',
              fontSize: '0.8rem',
              marginBottom: 20,
              textAlign: 'center',
            }}
          >
            {roles.find((r) => r.value === form.role)?.desc}
          </p>

          <form onSubmit={handleSubmit}>
            <div className="form-grid-2col" style={{ marginBottom: 12 }}>
              <div>
                <label className="form-label" htmlFor="reg-firstName">
                  First Name
                </label>
                <input
                  id="reg-firstName"
                  type="text"
                  className="form-control"
                  placeholder="John"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  onBlur={() => markTouched('firstName')}
                  required
                />
                {errors.firstName && (
                  <small style={{ color: 'var(--error)' }}>{errors.firstName}</small>
                )}
              </div>
              <div>
                <label className="form-label" htmlFor="reg-lastName">
                  Last Name
                </label>
                <input
                  id="reg-lastName"
                  type="text"
                  className="form-control"
                  placeholder="Doe"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>
            <div className="mb-3">
              <label className="form-label" htmlFor="reg-email">
                Email
              </label>
              <input
                id="reg-email"
                type="email"
                className="form-control"
                placeholder="you@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                onBlur={() => markTouched('email')}
                required
              />
              {errors.email && <small style={{ color: 'var(--error)' }}>{errors.email}</small>}
            </div>
            <div className="mb-3">
              <label className="form-label" htmlFor="reg-phone">
                Phone (optional)
              </label>
              <input
                id="reg-phone"
                type="tel"
                className="form-control"
                placeholder="+92 300 0000000"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="mb-3">
              <label className="form-label" htmlFor="reg-password">
                Password
              </label>
              <input
                id="reg-password"
                type="password"
                className="form-control"
                placeholder="Min. 6 characters"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                onBlur={() => markTouched('password')}
                required
                minLength={6}
              />
              {errors.password && (
                <small style={{ color: 'var(--error)' }}>{errors.password}</small>
              )}
              <PasswordStrengthBar password={form.password} />
            </div>
            <div className="mb-4">
              <label className="form-label" htmlFor="reg-confirmPassword">
                Confirm Password
              </label>
              <input
                id="reg-confirmPassword"
                type="password"
                className="form-control"
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onBlur={() => markTouched('confirmPassword')}
                required
              />
              {errors.confirmPassword && (
                <small style={{ color: 'var(--error)' }}>{errors.confirmPassword}</small>
              )}
            </div>
            <button
              type="submit"
              className="btn-gold w-100"
              style={{ padding: '13px', fontSize: '1rem' }}
              disabled={loading}
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
              Already have an account?{' '}
              <Link
                to="/login"
                style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
