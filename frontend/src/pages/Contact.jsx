import { useState } from 'react';
import { useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { Mail, Phone, MapPin, MessageCircle, Send } from 'lucide-react';
import api from '../utils/api';
import { CONTACT, waLink } from '../utils/contactInfo';
import SEO from '../components/SEO';

export default function Contact() {
  const { user } = useSelector((s) => s.auth);
  const [form, setForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    subject: '',
    message: '',
  });
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      await api.post('/complaints', form);
      toast.success('Complaint sent! The admin team will get back to you.');
      setForm((f) => ({ ...f, subject: '', message: '' }));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not send — please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="page-container"
      style={{ padding: '52px 32px', maxWidth: 1040, margin: '0 auto' }}
    >
      <SEO
        title="Contact Us"
        description="Get in touch with the Unified EV team for support, questions, partnership inquiries, or feedback. We're here to help."
      />
      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <h1 className="section-title" style={{ justifyContent: 'center' }}>
          Contact <span>Us</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', maxWidth: 520, margin: '0 auto' }}>
          Found a problem, got overcharged, or a station isn&apos;t as listed? Tell us — every
          complaint lands directly in the admin dashboard.
        </p>
      </div>

      <div className="row g-4">
        {/* Complaint form */}
        <div className="col-12 col-lg-7">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="ev-card"
            style={{ padding: 32 }}
          >
            <form onSubmit={handleSubmit}>
              <div className="form-grid-2col" style={{ marginBottom: 12 }}>
                <div>
                  <label className="form-label" htmlFor="contact-name">
                    Your Name
                  </label>
                  <input
                    id="contact-name"
                    type="text"
                    className="form-control"
                    required
                    minLength={2}
                    maxLength={100}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="form-label" htmlFor="contact-email">
                    Email
                  </label>
                  <input
                    id="contact-email"
                    type="email"
                    className="form-control"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
              </div>
              <div className="mb-3">
                <label className="form-label" htmlFor="contact-phone">
                  Phone / WhatsApp (optional — lets us reply on WhatsApp)
                </label>
                <input
                  id="contact-phone"
                  type="tel"
                  className="form-control"
                  placeholder="+92 3xx xxxxxxx"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="mb-3">
                <label className="form-label" htmlFor="contact-subject">
                  Subject
                </label>
                <input
                  id="contact-subject"
                  type="text"
                  className="form-control"
                  required
                  minLength={3}
                  maxLength={150}
                  placeholder="e.g. Wrong charge on my booking"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                />
              </div>
              <div className="mb-4">
                <label className="form-label" htmlFor="contact-message">
                  Your Complaint
                </label>
                <textarea
                  id="contact-message"
                  className="form-control"
                  rows={5}
                  required
                  minLength={10}
                  maxLength={2000}
                  placeholder="Describe what happened — station, slot, date, anything that helps us fix it."
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                />
              </div>
              <button
                type="submit"
                className="btn-gold"
                disabled={sending}
                style={{
                  width: '100%',
                  padding: 13,
                  fontSize: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                {sending ? (
                  'Sending...'
                ) : (
                  <>
                    Send Complaint <Send size={16} />
                  </>
                )}
              </button>
            </form>
          </motion.div>
        </div>

        {/* Direct contact card */}
        <div className="col-12 col-lg-5">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="ev-card"
            style={{ padding: 32, height: '100%' }}
          >
            <h2
              style={{
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontWeight: 700,
                fontSize: '1.6rem',
                letterSpacing: '0.02em',
                marginBottom: 8,
              }}
            >
              Reach us directly
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: 24 }}>
              Prefer talking to a human? {CONTACT.name} built and maintains Unified EV.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <a
                href={`tel:${CONTACT.phone.replace(/\s/g, '')}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  textDecoration: 'none',
                  color: 'var(--text-primary)',
                }}
              >
                <span
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    background: 'var(--primary-glow)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Phone size={18} color="var(--primary-dark)" />
                </span>
                <span>
                  <span
                    style={{
                      display: 'block',
                      fontSize: '0.72rem',
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    Phone
                  </span>
                  {CONTACT.phone}
                </span>
              </a>

              <a
                href={waLink(CONTACT.phone, 'Hi! I have a question about Unified EV.')}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  textDecoration: 'none',
                  color: 'var(--text-primary)',
                }}
              >
                <span
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    background: 'var(--primary-glow)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <MessageCircle size={18} color="var(--primary-dark)" />
                </span>
                <span>
                  <span
                    style={{
                      display: 'block',
                      fontSize: '0.72rem',
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    WhatsApp
                  </span>
                  Chat with us
                </span>
              </a>

              <a
                href={`mailto:${CONTACT.email}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  textDecoration: 'none',
                  color: 'var(--text-primary)',
                }}
              >
                <span
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    background: 'var(--primary-glow)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Mail size={18} color="var(--primary-dark)" />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span
                    style={{
                      display: 'block',
                      fontSize: '0.72rem',
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    Gmail
                  </span>
                  <span style={{ wordBreak: 'break-all' }}>{CONTACT.email}</span>
                </span>
              </a>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    background: 'var(--primary-glow)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <MapPin size={18} color="var(--primary-dark)" />
                </span>
                <span>
                  <span
                    style={{
                      display: 'block',
                      fontSize: '0.72rem',
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    Location
                  </span>
                  {CONTACT.location}
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
