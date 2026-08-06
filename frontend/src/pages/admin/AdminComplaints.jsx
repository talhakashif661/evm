import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { Inbox, Mail, MessageCircle, Trash2, Phone, User } from 'lucide-react';
import { fetchComplaints, deleteComplaint } from '../../store/slices/adminComplaintsSlice';
import { EmptyState } from '../../components/Spinner';
import { Skeleton } from '../../components/Skeleton';
import Pagination from '../../components/Pagination.jsx';
import SEO from '../../components/SEO';

const waDigits = (phone) => phone.replace(/\D/g, '');

const isValidEmail = (email) =>
  typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

const complaintReplyText = (c) => {
  const subject = 'Response to Your Complaint - Unified EV';
  const body = `Hello,

Thank you for contacting Unified EV.

Complaint:
"${c.subject}"

Message:
"${c.message}"

Response:


Best regards,
Unified EV Support Team`;
  return { subject, body };
};

// Gmail's web compose view — falls back to the system mail client (via
// mailto) when Gmail can't be opened, e.g. a popup blocker or the user
// isn't signed into a Google account in this browser.
const openGmailReply = (c) => {
  if (!isValidEmail(c.email)) {
    toast.error('This complaint has no valid email address to reply to.');
    return;
  }
  const { subject, body } = complaintReplyText(c);
  const mailto = `mailto:${c.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(c.email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  let gmailWindow;
  try {
    // No noopener/noreferrer: keeping the window reference is what lets us
    // detect a popup blocker below and fall back to mailto.
    gmailWindow = window.open(gmailUrl, '_blank');
  } catch {
    gmailWindow = null;
  }

  if (!gmailWindow || gmailWindow.closed || typeof gmailWindow.closed === 'undefined') {
    toast.error('Gmail popup was blocked — opening your default email app instead.');
    window.location.href = mailto;
  }
};

export default function AdminComplaints() {
  const dispatch = useDispatch();
  const { complaints, loading, pagination } = useSelector((s) => s.adminComplaints);
  const [page, setPage] = useState(1);

  useEffect(() => {
    dispatch(fetchComplaints({ page, limit: 10 }));
  }, [dispatch, page]);

  const handleDelete = (c) => {
    if (
      window.confirm(`Delete the complaint "${c.subject}" from ${c.name}? This cannot be undone.`)
    ) {
      dispatch(deleteComplaint(c.id));
    }
  };

  return (
    <div>
      <SEO
        title="User Complaints"
        description="View and respond to user complaints and support requests submitted through the Unified EV platform."
        noIndex
      />
      <div style={{ marginBottom: 24 }}>
        <h1 className="section-title">
          User <span>Complaints</span>
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
          Complaints filed through the Contact Us page. Reply on WhatsApp or Gmail, then delete once
          handled.
        </p>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="ev-card" style={{ padding: 24 }}>
              <Skeleton height={18} width="40%" style={{ marginBottom: 10 }} />
              <Skeleton height={13} width="65%" style={{ marginBottom: 8 }} />
              <Skeleton height={13} width="85%" />
            </div>
          ))}
        </div>
      ) : complaints.length === 0 ? (
        <EmptyState
          icon={<Inbox size={48} color="var(--text-muted)" strokeWidth={1.5} />}
          title="No complaints — inbox zero!"
          subtitle="When users submit the Contact Us form, their complaints appear here."
        />
      ) : (
        <>
          <div className="list-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {complaints.map((c, i) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="ev-card"
                style={{ padding: 24 }}
              >
                {/* Header: subject + date */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 12,
                    flexWrap: 'wrap',
                    marginBottom: 8,
                  }}
                >
                  <h2
                    style={{
                      fontFamily: 'Georgia, "Times New Roman", serif',
                      fontWeight: 700,
                      fontSize: '1.4rem',
                      letterSpacing: '0.02em',
                    }}
                  >
                    {c.subject}
                  </h2>
                  <span
                    style={{
                      color: 'var(--text-muted)',
                      fontSize: '0.78rem',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {new Date(c.createdAt).toLocaleString()}
                  </span>
                </div>

                {/* Who */}
                <div
                  style={{
                    display: 'flex',
                    gap: 14,
                    flexWrap: 'wrap',
                    marginBottom: 12,
                    color: 'var(--text-secondary)',
                    fontSize: '0.85rem',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <User size={13} /> {c.name}
                    {c.userId ? '' : ' (guest)'}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <Mail size={13} /> {c.email}
                  </span>
                  {c.phone && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <Phone size={13} /> {c.phone}
                    </span>
                  )}
                </div>

                {/* Message */}
                <p
                  style={{
                    whiteSpace: 'pre-wrap',
                    color: 'var(--text-primary)',
                    fontSize: '0.92rem',
                    background: 'var(--bg-elevated)',
                    borderRadius: 6,
                    padding: '14px 16px',
                    marginBottom: 16,
                  }}
                >
                  {c.message}
                </p>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {c.phone && (
                    <a
                      href={`https://wa.me/${waDigits(c.phone)}?text=${encodeURIComponent(`Hi ${c.name}, this is the Unified EV admin team regarding your complaint "${c.subject}".`)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-outline"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '7px 16px',
                        fontSize: '0.8rem',
                      }}
                    >
                      <MessageCircle size={14} /> Reply on WhatsApp
                    </a>
                  )}
                  <a
                    href={`mailto:${c.email}?subject=${encodeURIComponent(complaintReplyText(c).subject)}&body=${encodeURIComponent(complaintReplyText(c).body)}`}
                    onClick={(e) => {
                      e.preventDefault();
                      openGmailReply(c);
                    }}
                    className="btn-outline"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '7px 16px',
                      fontSize: '0.8rem',
                    }}
                  >
                    <Mail size={14} /> Reply by Gmail
                  </a>
                  <button
                    onClick={() => handleDelete(c)}
                    className="btn-danger-sm"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '7px 16px',
                      fontSize: '0.8rem',
                      marginLeft: 'auto',
                    }}
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              </motion.div>
            ))}
          </div>

          <Pagination
            page={page}
            totalPages={pagination?.pages}
            onChange={setPage}
            variant="standalone"
            total={pagination?.total}
            limit={10}
          />
        </>
      )}
    </div>
  );
}
