import { Component } from 'react';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';
import { logger } from '../utils/logger';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Centralized logging hook — wire up an error-reporting service here if desired.
    logger.error('Unhandled UI error:', error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        minHeight: '70vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24
      }}>
        <AlertTriangle size={52} color="var(--danger)" strokeWidth={1.5} />
        <h1 style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '2.6rem', fontWeight: 700, letterSpacing: '0.02em', margin: '20px 0 10px' }}>
          Something went <span style={{ color: 'var(--danger)' }}>wrong</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', maxWidth: 460, marginBottom: 8 }}>
          An unexpected error occurred while rendering this page. You can try again,
          or head back to a safe page.
        </p>
        {import.meta.env.DEV && this.state.error && (
          <pre style={{
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: 8, padding: 12, marginTop: 12, maxWidth: 600, overflow: 'auto',
            fontSize: '0.78rem', color: 'var(--danger)', textAlign: 'left'
          }}>
            {String(this.state.error?.message || this.state.error)}
          </pre>
        )}
        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          <button className="btn-outline" onClick={this.handleReset} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <RotateCcw size={16} /> Try Again
          </button>
          <a href="/" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
            <Home size={16} /> Go Home
          </a>
        </div>
      </div>
    );
  }
}
