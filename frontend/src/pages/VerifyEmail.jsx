import { useState, useRef, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { sendOTP, verifyOTP, resendOTP, tickCooldown } from '../store/slices/verificationSlice';
import { setUserVerified } from '../store/slices/authSlice';
import SEO from '../components/SEO';

export default function VerifyEmail() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { loading, otpSent, resendCooldown, isVerified } = useSelector((s) => s.verification);
  const { user } = useSelector((s) => s.auth);
  const [digits, setDigits] = useState(Array(6).fill(''));
  const [success, setSuccess] = useState(false);
  const inputRefs = useRef([]);
  const otpRequestedRef = useRef(false);

  // FIX #8: Redirect immediately if user is already verified — don't send a new OTP
  useEffect(() => {
    if (user?.isVerified) {
      navigate('/dashboard', { replace: true });
      return;
    }
    // Guards against React 18 StrictMode double-invoking this effect in dev
    // (and any accidental remount), which would otherwise fire two OTP emails.
    if (otpRequestedRef.current || otpSent) return;
    otpRequestedRef.current = true;
    dispatch(sendOTP());
    // otpSent/user?.isVerified deliberately excluded: this effect is meant
    // to fire exactly once per mount (that's the whole point of the ref
    // guard above, which exists specifically to survive React 18
    // StrictMode's double-invoke in dev) — re-running it whenever those
    // values change afterward would be redundant with that design, even
    // though the ref/otpSent guard would still prevent an actual double-send.
    // navigate is stable (guaranteed by React Router) so it's safe to include.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, navigate]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => dispatch(tickCooldown()), 1000);
    return () => clearInterval(interval);
  }, [dispatch, resendCooldown]);

  // FIX #2: sync isVerified into auth.user so the banner disappears immediately
  useEffect(() => {
    if (isVerified) {
      setSuccess(true);
      dispatch(setUserVerified());
      const timer = setTimeout(() => navigate('/dashboard', { replace: true }), 1500);
      return () => clearTimeout(timer);
    }
  }, [dispatch, isVerified, navigate]);

  const handleChange = (index, value) => {
    if (!/^[0-9]?$/.test(value)) return;
    const next = [...digits];
    next[index] = value;
    setDigits(next);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    const next = pasted.split('');
    while (next.length < 6) next.push('');
    setDigits(next);
    inputRefs.current[Math.min(pasted.length, 5)]?.focus();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const otp = digits.join('');
    if (otp.length !== 6) return;
    dispatch(verifyOTP(otp));
  };

  const handleResend = () => {
    if (resendCooldown > 0) return;
    setDigits(Array(6).fill(''));
    inputRefs.current[0]?.focus();
    dispatch(resendOTP());
  };

  if (success) {
    return (
      <div style={{ maxWidth: 420, margin: '64px auto', padding: '0 16px', textAlign: 'center' }}>
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}><CheckCircle2 size={48} color="var(--success)" strokeWidth={1.5} /></div>
        <h1 style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 700, fontSize: '1.9rem', letterSpacing: '0.02em', color: 'var(--text-primary)' }}>Email Verified!</h1>
        <p style={{ color: 'var(--text-muted)' }}>Redirecting to your dashboard...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 420, margin: '64px auto', padding: '0 16px' }}>
      <SEO title="Verify Your Email" description="Verify your email address to unlock all ChargeEV features." noIndex />
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: 32,
        textAlign: 'center'
      }}>
        <h1 style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 700, fontSize: '1.9rem', letterSpacing: '0.02em', marginBottom: 10 }}>Verify your email</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: 14 }}>
          We sent a 6-digit code to <strong>{user?.email}</strong>
        </p>

        <form onSubmit={handleSubmit}>
          <div
            style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 24 }}
            onPaste={handlePaste}
          >
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => (inputRefs.current[i] = el)}
                value={d}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                inputMode="numeric"
                maxLength={1}
                style={{
                  width: 44, height: 52, textAlign: 'center', fontSize: 22,
                  borderRadius: 4, border: '1.5px solid var(--border)',
                  background: 'var(--bg-surface)', color: 'var(--text-primary)'
                }}
              />
            ))}
          </div>

          <button
            type="submit"
            disabled={loading || digits.join('').length !== 6}
            style={{
              width: '100%', padding: '12px', borderRadius: 4, border: 'none',
              background: 'var(--primary)', color: '#fff', fontFamily: 'Inter', fontWeight: 700, cursor: 'pointer',
              opacity: (loading || digits.join('').length !== 6) ? 0.6 : 1
            }}
          >
            {loading ? 'Verifying...' : 'Verify Email'}
          </button>
        </form>

        <button
          onClick={handleResend}
          disabled={resendCooldown > 0 || loading}
          style={{
            marginTop: 16, background: 'none', border: 'none',
            color: resendCooldown > 0 ? 'var(--text-muted)' : 'var(--primary)',
            cursor: resendCooldown > 0 ? 'default' : 'pointer', fontSize: 14
          }}
        >
          {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
        </button>
      </div>
    </div>
  );
}
