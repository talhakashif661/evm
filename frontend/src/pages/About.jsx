import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Zap,
  Bot,
  Trophy,
  ShieldCheck,
  Phone,
  Mail,
  MessageCircle,
  MapPin,
  GraduationCap,
} from 'lucide-react';
import { CONTACT, waLink } from '../utils/contactInfo';
import SEO from '../components/SEO';

const pillars = [
  {
    icon: Zap,
    title: 'Real-time Booking',
    desc: 'Reserve a charging window on any approved station — the slot frees itself for others outside your window.',
  },
  {
    icon: Bot,
    title: 'AI Recommendations',
    desc: 'Station suggestions weighted by distance, price, and how urgent your battery situation is.',
  },
  {
    icon: Trophy,
    title: 'Priority Auctions',
    desc: 'Owners can auction premium slots; priority blends bid amount with battery urgency, so critical EVs win.',
  },
  {
    icon: ShieldCheck,
    title: 'Verified & Audited',
    desc: 'Email-verified accounts, admin-approved stations, and a full audit trail of every sensitive action.',
  },
];

export default function About() {
  return (
    <div
      className="page-container"
      style={{ padding: '52px 32px', maxWidth: 1040, margin: '0 auto' }}
    >
      <SEO
        title="About Us"
        description="Learn about Unified EV's mission to make EV charging simple, transparent, and reliable — real-time booking, AI recommendations, and priority auctions."
      />
      {/* Intro */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ textAlign: 'center', marginBottom: 44 }}
      >
        <h1 className="section-title" style={{ justifyContent: 'center' }}>
          About <span>Unified EV</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', maxWidth: 640, margin: '0 auto' }}>
          Unified EV is a marketplace that connects EV drivers with charging station owners across
          Pakistan — real-time slot booking, transparent PKR pricing, slot auctions, and an admin
          layer that keeps every station and payment honest.
        </p>
      </motion.div>

      {/* What it does */}
      <div className="row g-4" style={{ marginBottom: 48 }}>
        {pillars.map((p, i) => (
          <div key={p.title} className="col-12 col-md-6">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.07 }}
              className="ev-card"
              style={{ padding: 28, height: '100%' }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: 'var(--primary-glow)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 14,
                }}
              >
                <p.icon size={24} color="var(--primary-dark)" strokeWidth={1.7} />
              </div>
              <h2
                style={{
                  fontFamily: 'Georgia, "Times New Roman", serif',
                  fontWeight: 700,
                  fontSize: '1.45rem',
                  letterSpacing: '0.02em',
                  marginBottom: 8,
                }}
              >
                {p.title}
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem' }}>{p.desc}</p>
            </motion.div>
          </div>
        ))}
      </div>

      {/* Developer */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="ev-card"
        style={{ padding: 36, textAlign: 'center', maxWidth: 620, margin: '0 auto' }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            margin: '0 auto 14px',
            background: 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'Inter',
            fontWeight: 700,
            fontSize: '1.6rem',
            color: 'var(--on-dark)',
          }}
        >
          TK
        </div>
        <h2
          style={{
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontWeight: 700,
            fontSize: '1.9rem',
            letterSpacing: '0.02em',
            marginBottom: 6,
          }}
        >
          {CONTACT.name}
        </h2>
        <p
          style={{
            color: 'var(--text-secondary)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 4,
          }}
        >
          <GraduationCap size={16} /> Final Year Project — Punjab University
        </p>
        <p
          style={{
            color: 'var(--text-muted)',
            fontSize: '0.85rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            marginBottom: 24,
          }}
        >
          <MapPin size={14} /> {CONTACT.location}
        </p>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a
            href={`tel:${CONTACT.phone.replace(/\s/g, '')}`}
            className="btn-outline"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Phone size={15} /> Call
          </a>
          <a
            href={waLink(CONTACT.phone, 'Hi Talha! Found you through Unified EV.')}
            target="_blank"
            rel="noreferrer"
            className="btn-outline"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <MessageCircle size={15} /> WhatsApp
          </a>
          <a
            href={`mailto:${CONTACT.email}`}
            className="btn-outline"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Mail size={15} /> Email
          </a>
        </div>
      </motion.div>

      {/* CTA */}
      <div style={{ textAlign: 'center', marginTop: 40 }}>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 14 }}>
          Something not working the way it should?
        </p>
        <Link to="/contact">
          <button className="btn-gold" style={{ padding: '12px 32px' }}>
            File a Complaint
          </button>
        </Link>
      </div>
    </div>
  );
}
