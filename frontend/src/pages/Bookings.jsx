import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Calendar, MapPin, CreditCard, CheckCircle2, LogIn, ArrowRight } from 'lucide-react';
import {
  fetchMyBookings,
  cancelBooking,
  checkIn,
  createPaymentIntent,
} from '../store/slices/bookingSlice';
import { fetchMyEVs } from '../store/slices/evSlice';
import { BookingStatusBadge, EmptyState, Modal, Countdown } from '../components/Spinner';
import { Skeleton } from '../components/Skeleton';
import { toPKR } from '../utils/pkr';
import { getSocket } from '../utils/socket';
import { toast } from 'react-toastify';
import PaymentModal from '../components/PaymentModal';
import SEO from '../components/SEO';

const NO_SHOW_MINUTES = 15;

export default function Bookings() {
  const dispatch = useDispatch();
  const { bookings, loading, error } = useSelector((s) => s.bookings);
  const { evs } = useSelector((s) => s.ev);
  const { user } = useSelector((s) => s.auth);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [checkInModal, setCheckInModal] = useState(null); // holds the booking being checked into
  const [selectedEvId, setSelectedEvId] = useState('');
  const [paymentModal, setPaymentModal] = useState(null); // { bookingId, clientSecret, amount }
  const [payingBookingId, setPayingBookingId] = useState(null); // guards against a double-click firing two payment-intent requests

  useEffect(() => {
    dispatch(fetchMyBookings({ page, limit: 10, ...(filter && { status: filter }) }));
    dispatch(fetchMyEVs());
  }, [dispatch, page, filter]);

  // Real-time: payment confirmation and auto-cancellations (no-show / payment
  // timeout) happen server-side without the user taking an action here, so
  // this page needs to react live rather than wait for a manual refresh.
  useEffect(() => {
    if (!user) return;
    // No join:user emit needed — the server auto-joins this user's room
    // from their verified JWT on connection (see utils/socket.js).
    const socket = getSocket();

    const refresh = () =>
      dispatch(fetchMyBookings({ page, limit: 10, ...(filter && { status: filter }) }));
    const handleStatusChanged = ({ status, reason }) => {
      if (status === 'CANCELLED' && reason === 'NO_SHOW')
        toast.warning('A booking was cancelled — check-in window expired');
      if (status === 'CANCELLED' && reason === 'PAYMENT_TIMEOUT')
        toast.warning('A booking was cancelled — payment window expired');
      if (status === 'ACTIVE') toast.success('Payment confirmed — charging can begin!');
      refresh();
    };
    const handlePaymentFailed = () => toast.error('Payment failed — please try again');

    socket.on('booking:status-changed', handleStatusChanged);
    socket.on('payment:failed', handlePaymentFailed);

    return () => {
      socket.off('booking:status-changed', handleStatusChanged);
      socket.off('payment:failed', handlePaymentFailed);
    };
    // user?.id (not the full `user` object) is deliberate — see the same
    // pattern/reasoning in AuctionHub.jsx.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, user?.id, page, filter]);

  const statuses = ['', 'CONFIRMED', 'CHECKED_IN', 'ACTIVE', 'COMPLETED', 'CANCELLED'];

  const openCheckIn = (booking) => {
    setCheckInModal(booking);
    setSelectedEvId(booking.evId);
  };

  const handleConfirmCheckIn = async (e) => {
    e.preventDefault();
    const res = await dispatch(
      checkIn({
        id: checkInModal.id,
        evId: selectedEvId !== checkInModal.evId ? selectedEvId : undefined,
      })
    );
    if (!res.error) setCheckInModal(null);
  };

  const openPayment = async (booking) => {
    if (payingBookingId) return; // already creating a payment intent for a booking — ignore repeat clicks
    setPayingBookingId(booking.id);
    try {
      const res = await dispatch(createPaymentIntent(booking.id));
      if (!res.error) {
        setPaymentModal({
          bookingId: booking.id,
          clientSecret: res.payload.data.clientSecret,
          amount: res.payload.data.amount,
          mock: res.payload.data.mock,
        });
      }
    } finally {
      setPayingBookingId(null);
    }
  };

  const handlePaymentSuccess = () => {
    setPaymentModal(null);
    toast.info('Payment submitted — confirming...');
    dispatch(fetchMyBookings({ page, limit: 10, ...(filter && { status: filter }) }));
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '44px 32px' }}>
      <SEO
        title="My EV Charging Bookings"
        description="View and manage your EV charging bookings and history, including upcoming, active, and completed sessions."
        noIndex
      />
      <div style={{ marginBottom: 28 }}>
        <h1 className="section-title">
          My <span>Bookings</span>
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Your charging session history
        </p>
      </div>

      {/* Status filter */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        {statuses.map((s) => (
          <button
            key={s}
            onClick={() => {
              setFilter(s);
              setPage(1);
            }}
            style={{
              padding: '6px 16px',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontWeight: 600,
              background: filter === s ? 'var(--gold)' : 'var(--bg-card)',
              border: `1px solid ${filter === s ? 'var(--gold)' : 'var(--border)'}`,
              color: filter === s ? '#ffffff' : 'var(--text-secondary)',
              transition: 'background-color 0.12s ease, border-color 0.12s ease',
            }}
          >
            {(s || 'All').replace('_', ' ')}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="ev-card" style={{ padding: 20 }}>
              <Skeleton height={18} width="40%" style={{ marginBottom: 10 }} />
              <Skeleton height={13} width="70%" style={{ marginBottom: 8 }} />
              <Skeleton height={13} width="55%" />
            </div>
          ))}
        </div>
      ) : error && bookings.length === 0 ? (
        <EmptyState
          icon={<Calendar size={48} color="var(--error)" strokeWidth={1.5} />}
          title="Couldn't load your bookings"
          subtitle="Something went wrong on our end — this isn't a sign you have no bookings, the request just failed."
          action={
            <button
              className="btn-primary"
              onClick={() =>
                dispatch(fetchMyBookings({ page, limit: 10, ...(filter && { status: filter }) }))
              }
            >
              Try Again
            </button>
          }
        />
      ) : bookings.length === 0 ? (
        <EmptyState
          icon={<Calendar size={48} color="var(--text-muted)" strokeWidth={1.5} />}
          title={filter ? 'No bookings match this filter' : 'No bookings found'}
          subtitle={
            filter
              ? 'Try a different status, or view all your bookings.'
              : 'Book a charging slot to get started.'
          }
          action={
            filter ? (
              <button className="btn-outline" onClick={() => setFilter('')}>
                View All Bookings
              </button>
            ) : (
              <Link to="/stations">
                <button className="btn-primary">
                  Find a Station <ArrowRight size={14} />
                </button>
              </Link>
            )
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {bookings.map((b, i) => {
            const noShowDeadline = new Date(
              new Date(b.startTime).getTime() + NO_SHOW_MINUTES * 60 * 1000
            );
            // Windowed bookings must check in within the 15-minute arrival
            // window; auction wins have no scheduled window to be late for —
            // they get a much longer grace period enforced server-side instead.
            const canCheckIn =
              b.status === 'CONFIRMED' && (!b.plannedEndTime || new Date() < noShowDeadline);
            return (
              <motion.div
                key={b.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="ev-card"
                style={{ padding: 20 }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}
                    >
                      <h2
                        style={{
                          fontFamily: 'Georgia, "Times New Roman", serif',
                          fontWeight: 600,
                          fontSize: '1.3rem',
                          letterSpacing: '0.02em',
                        }}
                      >
                        {b.slot?.station?.name}
                      </h2>
                      <BookingStatusBadge status={b.status} />
                    </div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: 4 }}>
                      Slot #{b.slot?.slotNumber} · {b.ev?.model} ·{' '}
                      {new Date(b.startTime).toLocaleString()}
                      {b.plannedEndTime && <> → {new Date(b.plannedEndTime).toLocaleString()}</>}
                    </p>
                    <p
                      style={{
                        color: 'var(--text-muted)',
                        fontSize: '0.82rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        flexWrap: 'wrap',
                      }}
                    >
                      <MapPin size={13} /> {b.slot?.station?.address}, {b.slot?.station?.city}
                      {b.totalCost != null && (
                        <span style={{ color: 'var(--gold)', marginLeft: 12, fontWeight: 600 }}>
                          {toPKR(b.totalCost)}
                        </span>
                      )}
                      {b.overageAmount != null && (
                        <span style={{ color: 'var(--warning)', marginLeft: 8, fontWeight: 600 }}>
                          +{toPKR(b.overageAmount)} overage
                        </span>
                      )}
                    </p>
                    {canCheckIn && b.plannedEndTime && (
                      <p style={{ color: 'var(--warning)', fontSize: '0.78rem', marginTop: 4 }}>
                        Check in within <Countdown deadline={noShowDeadline} />
                      </p>
                    )}
                    {canCheckIn && !b.plannedEndTime && (
                      <p style={{ color: 'var(--warning)', fontSize: '0.78rem', marginTop: 4 }}>
                        You won this auction — check in to claim your slot and pay.
                      </p>
                    )}
                    {b.status === 'CHECKED_IN' && b.paymentDeadline && (
                      <p style={{ color: 'var(--warning)', fontSize: '0.78rem', marginTop: 4 }}>
                        Complete payment within <Countdown deadline={b.paymentDeadline} />
                      </p>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {canCheckIn && (
                      <button
                        onClick={() => openCheckIn(b)}
                        className="btn-gold"
                        style={{
                          padding: '6px 16px',
                          fontSize: '0.8rem',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <LogIn size={14} /> Check In
                      </button>
                    )}
                    {b.status === 'CHECKED_IN' && (
                      <button
                        onClick={() => openPayment(b)}
                        className="btn-gold"
                        disabled={payingBookingId === b.id}
                        style={{
                          padding: '6px 16px',
                          fontSize: '0.8rem',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          opacity: payingBookingId === b.id ? 0.6 : 1,
                        }}
                      >
                        <CreditCard size={14} />{' '}
                        {payingBookingId === b.id
                          ? 'Loading...'
                          : `Pay ${b.totalCost != null ? toPKR(b.totalCost) : ''}`}
                      </button>
                    )}
                    {['PENDING', 'CONFIRMED', 'CHECKED_IN'].includes(b.status) && (
                      <button
                        onClick={() => dispatch(cancelBooking(b.id))}
                        style={{
                          padding: '6px 14px',
                          background: '#F3E1DE',
                          border: '1px solid #E0BAB4',
                          borderRadius: 4,
                          color: 'var(--danger)',
                          cursor: 'pointer',
                          fontSize: '0.82rem',
                        }}
                      >
                        Cancel
                      </button>
                    )}
                    {b.status === 'COMPLETED' && b.totalCost != null && b.payment && (
                      <span
                        className="badge-success"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        <CheckCircle2 size={12} /> Paid
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Check-in modal: confirm arrival, optionally swap EV */}
      <Modal show={!!checkInModal} onClose={() => setCheckInModal(null)} title="Confirm Check-In">
        <form onSubmit={handleConfirmCheckIn}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: 16 }}>
            Confirm you&apos;ve arrived at{' '}
            <strong style={{ color: 'var(--text-primary)' }}>
              {checkInModal?.slot?.station?.name}
            </strong>
            , Slot #{checkInModal?.slot?.slotNumber}.
          </p>
          <div className="mb-4">
            <label className="form-label" htmlFor="checkin-ev">
              Charging Vehicle
            </label>
            <select
              id="checkin-ev"
              className="form-control"
              value={selectedEvId}
              onChange={(e) => setSelectedEvId(e.target.value)}
              required
            >
              {evs.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.model}
                  {ev.licensePlate ? ` (${ev.licensePlate})` : ''}
                </option>
              ))}
            </select>
            <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
              Changed your mind about which EV? Pick a different one here.
            </small>
          </div>
          <button type="submit" className="btn-gold" style={{ width: '100%', padding: 12 }}>
            Confirm Check-In
          </button>
        </form>
      </Modal>

      <PaymentModal
        show={!!paymentModal}
        onClose={() => setPaymentModal(null)}
        clientSecret={paymentModal?.clientSecret}
        amount={paymentModal?.amount}
        mock={paymentModal?.mock}
        onSuccess={handlePaymentSuccess}
      />
    </div>
  );
}
