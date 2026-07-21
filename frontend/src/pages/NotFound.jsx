import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { ZapOff, Home } from 'lucide-react';
import SEO from '../components/SEO';

export default function NotFound() {
  const { user, token } = useSelector((s) => s.auth);

  const homePath = !token ? '/' : user?.role === 'ADMIN' ? '/admin/dashboard' : '/dashboard';

  return (
    <div
      style={{
        minHeight: '70vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: 24,
      }}
    >
      <SEO
        title="Page Not Found"
        description="The page you're looking for doesn't exist or may have been moved. Return to ChargeEV to continue."
        noIndex
      />
      <ZapOff size={56} color="var(--primary)" strokeWidth={1.5} />
      <h1
        style={{
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: '3rem',
          fontWeight: 700,
          letterSpacing: '0.02em',
          margin: '22px 0 10px',
        }}
      >
        404 — <span style={{ color: 'var(--primary)' }}>Page Not Found</span>
      </h1>
      <p style={{ color: 'var(--text-secondary)', maxWidth: 420, marginBottom: 28 }}>
        The page you&apos;re looking for doesn&apos;t exist or may have been moved.
      </p>
      {/* Uses the shared button system (44px target, hover shadow) rather than
          the old one-off inline styling. Label/destination stay context-aware
          — a logged-in user is sent to their actual dashboard, not the public
          homepage, since that's more useful than a literal "Go Home". */}
      <Link to={homePath}>
        <button className="btn-primary" style={{ padding: '12px 28px' }}>
          <Home size={16} /> Back to{' '}
          {!token ? 'Home' : user?.role === 'ADMIN' ? 'Admin Dashboard' : 'Dashboard'}
        </button>
      </Link>
    </div>
  );
}
