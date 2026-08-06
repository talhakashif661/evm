import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Zap, Bot, Trophy, BarChart3, ArrowRight, ChevronDown } from 'lucide-react';
import SEO from '../components/SEO';
import JsonLd from '../components/JsonLd';
import { CONTACT } from '../utils/contactInfo';

const features = [
  {
    icon: Zap,
    title: 'Smart Booking',
    desc: 'Reserve charging slots instantly with real-time availability.',
  },
  {
    icon: Bot,
    title: 'AI Recommendations',
    desc: 'Get intelligent station suggestions based on distance, price, and urgency.',
  },
  {
    icon: Trophy,
    title: 'Slot Auctions',
    desc: 'Bid on premium slots — priority goes to critical battery levels.',
  },
  {
    icon: BarChart3,
    title: 'Usage Analytics',
    desc: 'Track your charging history, costs, and battery patterns.',
  },
];

const trustStats = [
  { value: '500+', label: 'Stations' },
  { value: '10,000+', label: 'Happy Drivers' },
  { value: '4.8★', label: 'Average Rating' },
];

export default function Landing() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="landing-page" style={{ minHeight: '100vh' }}>
      <SEO
        title="Find EV Charging Stations Near You"
        description="Discover and book EV charging stations near you. Real-time availability, transparent PKR pricing, AI-powered recommendations, and live slot auctions."
      />
      {/* Organization schema — every field here is real: no invented social
          profiles (the app has none — see contactInfo.js) or fabricated
          contact channel. url/logo resolve against the actual current
          origin rather than a hardcoded domain, same reasoning as SEO.jsx. */}
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: 'Unified EV',
          url: typeof window !== 'undefined' ? window.location.origin : '',
          logo: typeof window !== 'undefined' ? `${window.location.origin}/logo.png` : '',
          description:
            'Unified EV is an EV charging station management platform offering real-time slot booking, AI-powered station recommendations, and priority slot auctions.',
          contactPoint: {
            '@type': 'ContactPoint',
            telephone: CONTACT.phone,
            email: CONTACT.email,
            contactType: 'customer support',
          },
        }}
      />
      {/* Hero */}
      <section className="hero-section hero-v2">
        <div
          className="page-container"
          style={{
            padding: 0,
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            gap: 48,
            flexWrap: 'wrap',
          }}
        >
          <motion.div
            className="hero-copy"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            style={{ flex: '1 1 440px', minWidth: 280, display: 'flex', flexDirection: 'column' }}
          >
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.05 }}
              className="hero-kicker"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                alignSelf: 'flex-start',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--accent-gold)',
                borderRadius: 4,
                padding: '6px 16px',
                marginBottom: 22,
                // Scoped fix, not a --accent-gold-dark change: that variable is fine
                // elsewhere (large text, decorative icons), but at this chip's actual
                // size (0.82rem) and background (--bg-secondary), the original was
                // 2.84:1 — verified this replacement clears 4.5:1 (4.70:1) here.
                fontSize: '0.82rem',
                color: 'var(--accent-gold-deep)',
                fontWeight: 600,
              }}
            >
              <Zap size={14} /> AI-Powered Electric Vehicle Management
            </motion.div>

            <motion.h1
              className="hero-heading"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              style={{
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontSize: 'clamp(2.7rem, 6vw, 4.4rem)',
                fontWeight: 700,
                letterSpacing: '0.01em',
                lineHeight: 1.12,
                marginBottom: 20,
              }}
            >
              Unified EV
              <br />
              <span style={{ color: 'var(--accent-gold-dark)' }}>Management System</span>
            </motion.h1>

            <motion.p
              className="hero-lead"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.18 }}
              style={{
                fontSize: '1.08rem',
                color: 'var(--text-secondary)',
                marginBottom: 34,
                maxWidth: 480,
              }}
            >
              Book, charge, and manage your EV charging sessions — all in one place.
            </motion.p>

            <motion.div
              className="hero-ctas"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.26 }}
              style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}
            >
              <Link to="/stations">
                <button
                  className="btn-primary"
                  style={{
                    fontSize: '1rem',
                    padding: '14px 32px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  Find Stations <ArrowRight size={17} />
                </button>
              </Link>
              <Link to="/register">
                <button
                  className="btn-outline"
                  style={{ fontSize: '0.95rem', padding: '14px 32px' }}
                >
                  List Your Station
                </button>
              </Link>
            </motion.div>

            <p className="cta-microcopy">
              Free to browse — sign-up only needed to book or list a station.
            </p>

            <motion.div
              className="hero-stats"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.34 }}
              style={{ display: 'flex', gap: 0, marginTop: 44, flexWrap: 'wrap' }}
            >
              {trustStats.map((s, i) => (
                <div
                  key={s.label}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    paddingRight: 28,
                    marginRight: 28,
                    borderRight: i < trustStats.length - 1 ? '1px solid var(--border)' : 'none',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'Georgia, "Times New Roman", serif',
                      fontWeight: 700,
                      fontSize: '1.6rem',
                      color: 'var(--text-primary)',
                      lineHeight: 1,
                    }}
                  >
                    {s.value}
                  </span>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      color: 'var(--text-muted)',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      marginTop: 4,
                    }}
                  >
                    {s.label}
                  </span>
                </div>
              ))}
            </motion.div>
          </motion.div>

          <motion.div
            className="hero-illustration"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            style={{ flex: '1 1 320px', minWidth: 260, maxWidth: 440 }}
          >
            <img
              src="/ev-hero-car.png"
              alt="Electric vehicle charging at a Unified EV station"
              width="420"
              height="340"
              style={{ width: '100%', height: 'auto', display: 'block' }}
            />
          </motion.div>
        </div>

        {/* Scroll indicator — a real link to the features section, not just decoration */}
        <motion.a
          href="#features"
          className="hero-scroll-indicator"
          aria-label="Scroll to explore features"
          animate={shouldReduceMotion ? { y: 0 } : { y: [0, 8, 0] }}
          transition={
            shouldReduceMotion
              ? { duration: 0 }
              : { duration: 1.8, repeat: Infinity, ease: 'easeInOut' }
          }
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 14,
            transform: 'translateX(-50%)',
            color: 'var(--text-muted)',
            display: 'flex',
          }}
        >
          <ChevronDown size={22} />
        </motion.a>
      </section>

      {/* Features */}
      <section
        id="features"
        className="page-container"
        style={{ padding: '104px 32px', background: 'var(--bg-surface)' }}
      >
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          style={{ textAlign: 'center', marginBottom: 56 }}
        >
          <h2
            style={{
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontSize: '2.8rem',
              fontWeight: 700,
              letterSpacing: '0.02em',
              marginBottom: 14,
            }}
          >
            Everything You Need to <span style={{ color: 'var(--primary)' }}>Charge Smarter</span>
          </h2>
          <p style={{ color: 'var(--text-secondary)' }}>
            Built for EV users, charging station owners, and admins.
          </p>
        </motion.div>

        <div className="row g-4">
          {features.map((f, i) => (
            <div key={i} className="col-12 col-md-6">
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="ev-card landing-feature-card"
                style={{ padding: 32 }}
              >
                <div
                  style={{
                    marginBottom: 16,
                    width: 56,
                    height: 56,
                    borderRadius: 10,
                    background: 'var(--primary-glow)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <f.icon size={28} color="var(--primary-dark)" strokeWidth={1.6} />
                </div>
                <h3
                  style={{
                    fontFamily: 'Georgia, "Times New Roman", serif',
                    fontSize: '1.65rem',
                    fontWeight: 700,
                    letterSpacing: '0.02em',
                    marginBottom: 10,
                  }}
                >
                  {f.title}
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>{f.desc}</p>
              </motion.div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section
        className="landing-cta-section"
        style={{
          padding: '32px 32px 120px',
          textAlign: 'center',
          background: 'var(--bg-elevated)',
          borderTop: '1px solid var(--border)',
        }}
      >
        <motion.div
          className="landing-cta-card"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          style={{
            maxWidth: 640,
            margin: '0 auto',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '64px 40px',
            marginTop: 40,
          }}
        >
          <h2
            style={{
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontSize: '2.6rem',
              fontWeight: 700,
              letterSpacing: '0.02em',
              marginBottom: 18,
            }}
          >
            Ready to Plug In?
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 32 }}>
            Join thousands of EV drivers using intelligent charging management.
          </p>
          <Link to="/register">
            <button
              className="btn-gold"
              style={{
                fontSize: '1rem',
                padding: '14px 40px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              Create Free Account <Zap size={17} />
            </button>
          </Link>
        </motion.div>
      </section>
    </div>
  );
}
