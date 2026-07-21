import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { KeyRound } from 'lucide-react';
import api from '../utils/api';
import { toast } from 'react-toastify';
import { PasswordStrengthBar } from '../components/PasswordStrengthBar';
import SEO from '../components/SEO';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';
  const email = searchParams.get('email') || '';

  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPassword !== confirm) { toast.error('Passwords do not match'); return; }
    if (!token || !email) { toast.error('This reset link is invalid. Please request a new one.'); return; }

    setLoading(true);
    try {
      await api.post('/auth/reset-password', { email, token, newPassword });
      toast.success('Password reset! Please sign in.');
      navigate('/login');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reset password');
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      background: 'var(--bg-page)' }}>
      <SEO title="Reset Password" description="Set a new password for your ChargeEV account." noIndex />
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 60, height: 60, borderRadius: 16, background: 'var(--primary-glow)',
            border: '1px solid var(--border-hover)', marginBottom: 16 }}>
            <KeyRound size={26} color="var(--primary)" />
          </div>
          <h1 style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '2.3rem', fontWeight: 700, letterSpacing: '0.02em', marginBottom: 8 }}>
            Set a New <span style={{ color: 'var(--primary)' }}>Password</span>
          </h1>
          {email && <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>for {email}</p>}
        </div>

        <div className="ev-card" style={{ padding: 32 }}>
          {!token || !email ? (
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: 'var(--danger)', marginBottom: 16 }}>This reset link is invalid or incomplete.</p>
              <Link to="/forgot-password" className="btn-gold" style={{ padding: '10px 22px', textDecoration: 'none' }}>
                Request a New Link
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="mb-3">
                <label className="form-label" htmlFor="reset-newPw">New Password</label>
                <input id="reset-newPw" type="password" className="form-control" placeholder="Min. 6 characters"
                  value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6} />
                <PasswordStrengthBar password={newPassword} />
              </div>
              <div className="mb-4">
                <label className="form-label" htmlFor="reset-confirmPw">Confirm New Password</label>
                <input id="reset-confirmPw" type="password" className="form-control"
                  value={confirm} onChange={e => setConfirm(e.target.value)} required minLength={6} />
                {confirm && confirm !== newPassword && <small style={{ color: 'var(--error)' }}>Passwords don&apos;t match</small>}
              </div>
              <button type="submit" className="btn-gold w-100" style={{ padding: '13px', fontSize: '1rem' }} disabled={loading}>
                {loading ? 'Resetting...' : 'Reset Password'}
              </button>
            </form>
          )}

          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <Link to="/login" style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600, fontSize: '0.88rem' }}>
              Back to Sign In
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
