import { Link } from 'react-router-dom';
import { Zap, MessageCircle, MapPin, Phone, Mail } from 'lucide-react';
import { CONTACT, waLink } from '../utils/contactInfo';

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="page-container" style={{ padding: '48px 24px 24px' }}>
        <div className="row g-4">
          <div className="col-12 col-md-4">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  background: 'var(--primary-glow)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Zap size={17} color="var(--primary)" fill="var(--primary)" strokeWidth={1} />
              </div>
              <span
                style={{
                  fontFamily: 'Georgia, "Times New Roman", serif',
                  fontWeight: 700,
                  fontSize: '1.15rem',
                }}
              >
                Charge<span style={{ color: 'var(--primary)' }}>EV</span>
              </span>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', maxWidth: 280 }}>
              Find, book, and bid on EV charging slots — smarter charging for a cleaner commute.
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <a
                href={waLink(CONTACT.phone, 'Hi! Reaching out from the ChargeEV site.')}
                target="_blank"
                rel="noreferrer"
                className="footer-social"
                aria-label="WhatsApp"
              >
                <MessageCircle size={16} />
              </a>
              <a href={`mailto:${CONTACT.email}`} className="footer-social" aria-label="Email">
                <Mail size={16} />
              </a>
              <a
                href={`tel:${CONTACT.phone.replace(/\s/g, '')}`}
                className="footer-social"
                aria-label="Call"
              >
                <Phone size={16} />
              </a>
            </div>
          </div>

          <div className="col-6 col-md-2">
            <h4
              style={{
                fontFamily: 'Inter',
                fontWeight: 700,
                fontSize: '0.8rem',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--text-muted)',
                marginBottom: 14,
              }}
            >
              Quick Links
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Link to="/">Home</Link>
              <Link to="/stations">Stations</Link>
              <Link to="/register">Get Started</Link>
              <Link to="/login">Sign In</Link>
            </div>
          </div>

          <div className="col-6 col-md-2">
            <h4
              style={{
                fontFamily: 'Inter',
                fontWeight: 700,
                fontSize: '0.8rem',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--text-muted)',
                marginBottom: 14,
              }}
            >
              Company
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Link to="/about">About Us</Link>
              <Link to="/contact">Contact Us</Link>
            </div>
          </div>

          <div className="col-12 col-md-4">
            <h4
              style={{
                fontFamily: 'Inter',
                fontWeight: 700,
                fontSize: '0.8rem',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--text-muted)',
                marginBottom: 14,
              }}
            >
              Get in Touch
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.88rem' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  color: 'var(--text-secondary)',
                }}
              >
                <MapPin size={14} style={{ flexShrink: 0 }} /> {CONTACT.location}
              </span>
              <a
                href={`tel:${CONTACT.phone.replace(/\s/g, '')}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                <Phone size={14} style={{ flexShrink: 0 }} /> {CONTACT.phone}
              </a>
              <a
                href={`mailto:${CONTACT.email}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  wordBreak: 'break-all',
                }}
              >
                <Mail size={14} style={{ flexShrink: 0 }} /> {CONTACT.email}
              </a>
            </div>
          </div>
        </div>

        <div className="glow-line" style={{ margin: '32px 0 20px' }} />

        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
          © {year} ChargeEV. All rights reserved. · Developed by {CONTACT.name} — Punjab University
        </p>
      </div>
    </footer>
  );
}
