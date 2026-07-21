import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { MapPin, Wallet, Phone, Zap, Trophy, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Skeleton, SkeletonRow } from '../components/Skeleton';
import { toast } from 'react-toastify';
import { fetchStationById } from '../store/slices/stationSlice';
import { createBooking } from '../store/slices/bookingSlice';
import { placeBid, fetchSlotBids } from '../store/slices/bidSlice';
import { fetchMyEVs } from '../store/slices/evSlice';
import { Modal, SlotStatusBadge, Countdown } from '../components/Spinner';
import { Stars, StarInput } from '../components/Stars';
import api from '../utils/api';
import { toPKR } from '../utils/pkr';
import { getSocket } from '../utils/socket';
import SEO from '../components/SEO';
import JsonLd from '../components/JsonLd';

// datetime-local inputs need "YYYY-MM-DDTHH:mm" in the user's LOCAL time, not
// UTC — shifting the Date by its own timezone offset before toISOString()
// (which always outputs UTC) is the standard way to get that correctly.
const nowForDatetimeLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

export default function StationDetail() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const { currentStation, loading } = useSelector((s) => s.stations);
  const { evs } = useSelector((s) => s.ev);
  const { slotBids, loading: bidLoading } = useSelector((s) => s.bids);
  const { token, user } = useSelector((s) => s.auth);
  const [reviews, setReviews] = useState([]);
  const [reviewStats, setReviewStats] = useState({ ratingAvg: 0, ratingCount: 0 });
  const [reviewModal, setReviewModal] = useState(false);
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: '' });
  const [savingReview, setSavingReview] = useState(false);
  const [bookingModal, setBookingModal] = useState(null);
  const [bidModal, setBidModal] = useState(null);
  const [bookForm, setBookForm] = useState({ evId: '', startTime: '', durationMinutes: 60 });
  const [bidForm, setBidForm] = useState({ amount: '', batteryLevel: '' });
  const [slotAvailability, setSlotAvailability] = useState({}); // slotId -> [{startTime, plannedEndTime}]

  useEffect(() => {
    dispatch(fetchStationById(id));
    fetchReviews();
    if (token) dispatch(fetchMyEVs());
  }, [dispatch, id, fetchReviews, token]);

  // Live-availability UX: fetch each slot's upcoming booked windows so users
  // can see conflicts before attempting to book, instead of only finding out
  // via the 409 error on submit.
  // A stable key derived from just the slot IDs, not the array reference —
  // currentStation gets a new object reference on every fetch even when the
  // underlying slots haven't changed, and re-running socket join/leave or
  // refetching availability on every such reference change would be
  // wasteful churn, not a real "slots changed" event. Same technique the
  // socket effect below already used; extracted here so both share it.
  const slotIdsKey = currentStation?.slots?.map((sl) => sl.id).join(',') || '';

  const refreshAvailability = useCallback(() => {
    if (!currentStation?.slots?.length) return;
    Promise.all(
      currentStation.slots.map((slot) =>
        api.get(`/slots/${slot.id}/availability`).then((res) => [slot.id, res.data.data])
      )
    )
      .then((entries) => setSlotAvailability(Object.fromEntries(entries)))
      .catch(() => {});
    // Intentionally keyed on slotIdsKey, not currentStation.slots itself —
    // see the comment on slotIdsKey above for why.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotIdsKey]);

  useEffect(refreshAvailability, [refreshAvailability]);

  // Other users' bookings/cancellations/check-ins on this station's slots
  // should update what's shown here too, not just this user's own actions.
  useEffect(() => {
    if (!currentStation?.slots?.length) return;
    const socket = getSocket();
    const slotIds = currentStation.slots.map((sl) => sl.id);
    slotIds.forEach((sid) => socket.emit('join:slot', sid));

    const handleAvailabilityChanged = () => refreshAvailability();
    socket.on('slot:availability-changed', handleAvailabilityChanged);

    return () => {
      slotIds.forEach((sid) => socket.emit('leave:slot', sid));
      socket.off('slot:availability-changed', handleAvailabilityChanged);
    };
    // Same reasoning as refreshAvailability above: keyed on the stable
    // slotIdsKey, not currentStation.slots directly, so this doesn't tear
    // down and rejoin every socket room on every station-object reference
    // change — only when the actual set of slot IDs changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotIdsKey, refreshAvailability]);

  // Does [start, plannedEnd) overlap any already-booked window on this slot?
  const findConflict = (slotId, start, plannedEnd) => {
    const windows = slotAvailability[slotId] || [];
    return windows.find((w) => {
      const wStart = new Date(w.startTime);
      const wEnd = w.plannedEndTime ? new Date(w.plannedEndTime) : null;
      return start < (wEnd || new Date(8640000000000000)) && plannedEnd > wStart;
    });
  };

  const fetchReviews = useCallback(async () => {
    try {
      const res = await api.get(`/reviews/station/${id}`);
      setReviews(res.data.data || []);
      setReviewStats(res.data.stats || { ratingAvg: 0, ratingCount: 0 });
    } catch {
      /* reviews are non-critical decoration */
    }
  }, [id]);

  const myReview = reviews.find((r) => r.user?.id === user?.id);

  const openReviewModal = () => {
    setReviewForm(
      myReview
        ? { rating: myReview.rating, comment: myReview.comment || '' }
        : { rating: 5, comment: '' }
    );
    setReviewModal(true);
  };

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    setSavingReview(true);
    try {
      const res = await api.post('/reviews', { stationId: id, ...reviewForm });
      toast.success(res.data.message);
      setReviewModal(false);
      fetchReviews();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not save review');
    } finally {
      setSavingReview(false);
    }
  };

  const handleDeleteReview = async () => {
    if (!myReview || !window.confirm('Delete your review?')) return;
    try {
      await api.delete(`/reviews/${myReview.id}`);
      toast.info('Review deleted');
      fetchReviews();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not delete review');
    }
  };

  const openBidModal = (slot) => {
    setBidModal(slot);
    dispatch(fetchSlotBids(slot.id));
  };

  const handleBook = async (e) => {
    e.preventDefault();
    const res = await dispatch(
      createBooking({
        slotId: bookingModal.id,
        evId: bookForm.evId,
        startTime: bookForm.startTime,
        durationMinutes: bookForm.durationMinutes,
      })
    );
    if (!res.error) {
      setBookingModal(null);
      dispatch(fetchStationById(id));
    }
  };

  const handleBid = async (e) => {
    e.preventDefault();
    const res = await dispatch(
      placeBid({
        slotId: bidModal.id,
        amount: parseFloat(bidForm.amount),
        batteryLevel: parseFloat(bidForm.batteryLevel),
      })
    );
    if (!res.error) {
      setBidModal(null);
    }
  };

  if (loading || !currentStation)
    return (
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '44px 32px' }}>
        <div className="ev-card" style={{ padding: 32, marginBottom: 28 }}>
          <Skeleton height={32} width="50%" style={{ marginBottom: 12 }} />
          <Skeleton height={14} width="65%" style={{ marginBottom: 20 }} />
          <div style={{ display: 'flex', gap: 10 }}>
            <Skeleton height={160} width={160} radius={10} />
            <Skeleton height={160} width={160} radius={10} />
          </div>
        </div>
        <Skeleton height={26} width="30%" style={{ marginBottom: 20 }} />
        <div className="row g-4" style={{ marginBottom: 28 }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="col-12 col-md-4">
              <div className="ev-card" style={{ padding: 20 }}>
                <Skeleton height={18} width="50%" style={{ marginBottom: 12 }} />
                <Skeleton height={36} radius={9} />
              </div>
            </div>
          ))}
        </div>
        <Skeleton height={26} width="25%" style={{ marginBottom: 16 }} />
        <div className="ev-card" style={{ padding: 20 }}>
          {[...Array(3)].map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      </div>
    );

  const s = currentStation;

  // Structured data — every field below is a real, already-fetched value.
  // Two things worth noting:
  // - image: station photos are stored as base64 data-URLs (see the
  //   ChargingStation model), not hosted URLs a crawler can fetch. Using one
  //   here would bloat the page and likely fail Google's image requirements,
  //   so this points at the site-level OG image (a real, crawlable file)
  //   instead of s.images[0].
  // - review: capped at 5, matching a representative SAMPLE of what's
  //   genuinely visible on this page (the API can return up to 20) — not
  //   trying to mirror every review, which isn't how Google expects this
  //   to be used and would bloat the page for no benefit.
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const pageUrl = typeof window !== 'undefined' ? `${origin}${window.location.pathname}` : '';
  const hasAvailableSlot = s.slots?.some((sl) => sl.status === 'AVAILABLE');
  const amenityText = s.amenities?.length ? ` Amenities: ${s.amenities.join(', ')}.` : '';

  const productSchema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: s.name,
    description: `EV charging station in ${s.city}, priced at ${s.pricePerKwh} PKR per kWh.${amenityText}`,
    image: `${origin}/og-image.png`,
    offers: {
      '@type': 'Offer',
      price: s.pricePerKwh,
      priceCurrency: 'PKR',
      availability: hasAvailableSlot
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      url: pageUrl,
    },
    ...(reviewStats.ratingCount > 0 && {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: reviewStats.ratingAvg,
        reviewCount: reviewStats.ratingCount,
      },
    }),
    ...(reviews.length > 0 && {
      review: reviews.slice(0, 5).map((r) => ({
        '@type': 'Review',
        reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5, worstRating: 1 },
        author: { '@type': 'Person', name: r.user?.name || 'ChargeEV user' },
        ...(r.comment && { reviewBody: r.comment }),
        datePublished: r.createdAt,
      })),
    }),
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '44px 32px' }}>
      <SEO
        title={`${s.name} - EV Charging Station Details`}
        description={`View pricing, availability, and book ${s.name} EV charging station in ${s.city}. Real-time slot status and instant confirmation.`}
      />
      <JsonLd data={productSchema} />
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="ev-card"
        style={{ padding: 32, marginBottom: 28 }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div>
            <h1
              style={{
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontSize: '2.6rem',
                fontWeight: 700,
                letterSpacing: '0.02em',
                marginBottom: 10,
              }}
            >
              {s.name}
            </h1>
            <div style={{ marginBottom: 8 }}>
              <Stars value={reviewStats.ratingAvg} count={reviewStats.ratingCount} size={16} />
            </div>
            <p
              style={{
                color: 'var(--text-muted)',
                marginBottom: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <MapPin size={14} /> {s.address}, {s.city}
            </p>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <span
                className="badge-gold"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <Wallet size={12} /> {toPKR(s.pricePerKwh)}/kWh
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Owner: {s.owner?.name}
              </span>
              {s.owner?.phone && (
                <span
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: '0.85rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Phone size={13} /> {s.owner.phone}
                </span>
              )}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginBottom: 4 }}>
              AVAILABLE SLOTS
            </p>
            <p
              style={{
                fontFamily: 'Inter',
                fontSize: '2.5rem',
                fontWeight: 700,
                color: 'var(--gold)',
                lineHeight: 1,
              }}
            >
              {s.slots?.filter((sl) => sl.status === 'AVAILABLE').length}/{s.slots?.length}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Photos */}
      {s.images?.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 10,
            overflowX: 'auto',
            marginBottom: 24,
            paddingBottom: 4,
          }}
        >
          {s.images.map((img, i) => (
            <img
              key={i}
              src={img}
              alt={`${s.name} photo ${i + 1}`}
              loading={i === 0 ? 'eager' : 'lazy'}
              style={{
                width: 160,
                height: 120,
                objectFit: 'cover',
                borderRadius: 10,
                border: '1px solid var(--border)',
                flexShrink: 0,
              }}
            />
          ))}
        </div>
      )}

      {/* Amenities */}
      {s.amenities?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 28 }}>
          {s.amenities.map((a) => (
            <span key={a} className="badge-info" style={{ fontSize: '0.78rem' }}>
              {a}
            </span>
          ))}
        </div>
      )}

      {/* Slots grid */}
      <h2
        style={{
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: '1.8rem',
          fontWeight: 700,
          letterSpacing: '0.02em',
          marginBottom: 22,
        }}
      >
        Charging Slots
      </h2>
      <div className="row g-3">
        {s.slots?.map((slot, i) => (
          <div key={slot.id} className="col-12 col-sm-6 col-md-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.06 }}
              className="ev-card"
              style={{ padding: 20 }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 12,
                }}
              >
                <h3
                  style={{
                    fontFamily: 'Georgia, "Times New Roman", serif',
                    fontWeight: 600,
                    fontSize: '1.2rem',
                    letterSpacing: '0.02em',
                  }}
                >
                  Slot #{slot.slotNumber}
                </h3>
                <SlotStatusBadge status={slot.status} />
              </div>

              <p
                style={{
                  color: 'var(--text-muted)',
                  fontSize: '0.82rem',
                  marginBottom: 4,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Zap size={13} /> {slot.powerKw} kW
              </p>

              {slotAvailability[slot.id]?.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <p
                    style={{
                      color: 'var(--text-muted)',
                      fontSize: '0.72rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      marginBottom: 4,
                    }}
                  >
                    Upcoming bookings
                  </p>
                  {slotAvailability[slot.id].slice(0, 3).map((w, wi) => (
                    <p
                      key={wi}
                      style={{
                        color: 'var(--text-secondary)',
                        fontSize: '0.76rem',
                        margin: '2px 0',
                      }}
                    >
                      {new Date(w.startTime).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                      {w.plannedEndTime
                        ? ` – ${new Date(w.plannedEndTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                        : ' (open-ended)'}
                    </p>
                  ))}
                  {slotAvailability[slot.id].length > 3 && (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.74rem' }}>
                      +{slotAvailability[slot.id].length - 3} more
                    </p>
                  )}
                </div>
              )}

              {slot.auctionOpen && (
                <div
                  style={{
                    marginBottom: 12,
                    padding: '8px 12px',
                    background: '#F1E3D3',
                    border: '1px solid #DEC49E',
                    borderRadius: 4,
                  }}
                >
                  <p
                    style={{
                      color: 'var(--warning)',
                      fontWeight: 600,
                      fontSize: '0.82rem',
                      marginBottom: 2,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <Trophy size={13} /> AUCTION ACTIVE
                  </p>
                  {slot.auctionEnd && (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      Ends in <Countdown deadline={slot.auctionEnd} />
                    </p>
                  )}
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                    {slot.bids?.length || 0} bid(s) placed
                  </p>
                </div>
              )}

              {!token && (['AVAILABLE', 'RESERVED'].includes(slot.status) || slot.auctionOpen) && (
                <Link to="/login" style={{ display: 'block', marginTop: 8 }}>
                  <button
                    className="btn-primary"
                    style={{ width: '100%', padding: '8px', fontSize: '0.85rem' }}
                  >
                    Sign in to book
                  </button>
                </Link>
              )}

              {token && ['AVAILABLE', 'RESERVED'].includes(slot.status) && !slot.auctionOpen && (
                <>
                  <button
                    className="btn-gold"
                    style={{ width: '100%', padding: '8px', fontSize: '0.85rem', marginTop: 8 }}
                    onClick={() => {
                      setBookingModal(slot);
                      setBookForm({
                        evId: evs[0]?.id || '',
                        startTime: new Date().toISOString().slice(0, 16),
                        durationMinutes: 60,
                      });
                    }}
                  >
                    Book Now
                  </button>
                  <p className="cta-microcopy" style={{ textAlign: 'center' }}>
                    Reserving your slot doesn&apos;t charge your card yet.
                  </p>
                </>
              )}

              {token && slot.auctionOpen && (
                <button
                  className="btn-primary"
                  style={{
                    width: '100%',
                    padding: '8px',
                    fontSize: '0.85rem',
                    marginTop: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                  onClick={() => openBidModal(slot)}
                >
                  Place Bid <Trophy size={14} />
                </button>
              )}
            </motion.div>
          </div>
        ))}
      </div>

      {/* Reviews */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          margin: '40px 0 20px',
        }}
      >
        <h2
          style={{
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize: '1.8rem',
            fontWeight: 700,
            letterSpacing: '0.02em',
            margin: 0,
          }}
        >
          Reviews{' '}
          <span style={{ color: 'var(--text-muted)', fontSize: '0.95rem', fontWeight: 600 }}>
            ({reviewStats.ratingCount})
          </span>
        </h2>
        {token && user?.role === 'EV_USER' && (
          <button
            className="btn-outline-gold"
            style={{ padding: '8px 18px', fontSize: '0.82rem' }}
            onClick={openReviewModal}
          >
            {myReview ? 'Edit your review' : 'Write a review'}
          </button>
        )}
      </div>

      {reviews.length === 0 ? (
        <div className="ev-card" style={{ padding: 28, textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>
            No reviews yet — the first review comes from the first driver to complete and pay for a
            session here.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {reviews.map((r, i) => (
            <motion.article
              key={r.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="ev-card"
              style={{ padding: 20 }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 8,
                  marginBottom: 6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: 'var(--primary-glow)',
                      color: 'var(--primary-dark)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: 'Inter',
                      fontWeight: 700,
                      fontSize: '0.9rem',
                      overflow: 'hidden',
                    }}
                  >
                    {r.user?.avatar ? (
                      <img
                        src={r.user.avatar}
                        alt=""
                        loading="lazy"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      r.user?.name?.[0]?.toUpperCase()
                    )}
                  </span>
                  <div>
                    <p style={{ fontWeight: 600, fontSize: '0.9rem', margin: 0 }}>
                      {r.user?.name}
                      {r.user?.id === user?.id && (
                        <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> (you)</span>
                      )}
                    </p>
                    <Stars value={r.rating} size={13} />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                    {new Date(r.createdAt).toLocaleDateString()}
                  </span>
                  {r.user?.id === user?.id && (
                    <button
                      onClick={handleDeleteReview}
                      className="btn-danger-sm"
                      style={{ padding: '4px 10px', fontSize: '0.72rem' }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
              {r.comment && (
                <p
                  style={{
                    color: 'var(--text-secondary)',
                    fontSize: '0.9rem',
                    margin: '4px 0 0 42px',
                  }}
                >
                  {r.comment}
                </p>
              )}
            </motion.article>
          ))}
        </div>
      )}

      {/* Review Modal */}
      <Modal
        show={reviewModal}
        onClose={() => setReviewModal(false)}
        title={myReview ? 'Edit Your Review' : `Review ${s.name}`}
      >
        <form onSubmit={handleSubmitReview}>
          <fieldset className="mb-3" style={{ border: 'none', padding: 0, margin: 0 }}>
            <legend
              className="form-label"
              style={{ padding: 0, marginBottom: 4, fontSize: 'inherit', float: 'none' }}
            >
              Your rating
            </legend>
            <StarInput
              value={reviewForm.rating}
              onChange={(rating) => setReviewForm({ ...reviewForm, rating })}
            />
          </fieldset>
          <div className="mb-4">
            <label className="form-label" htmlFor="review-comment">
              Comment (optional)
            </label>
            <textarea
              id="review-comment"
              className="form-control"
              rows={4}
              maxLength={1000}
              placeholder="How was the charging speed, location, owner?"
              value={reviewForm.comment}
              onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })}
            />
            <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
              Only drivers who completed and paid for a session here can review — that keeps every
              rating genuine.
            </small>
          </div>
          <button
            type="submit"
            className="btn-gold"
            style={{ width: '100%', padding: 12 }}
            disabled={savingReview}
          >
            {savingReview ? 'Saving...' : myReview ? 'Update Review' : 'Post Review'}
          </button>
        </form>
      </Modal>

      {/* Booking Modal */}
      <Modal
        show={!!bookingModal}
        onClose={() => setBookingModal(null)}
        title={`Book Slot #${bookingModal?.slotNumber}`}
      >
        <form onSubmit={handleBook}>
          <div className="mb-3">
            <label className="form-label" htmlFor="book-ev">
              Select Your EV
            </label>
            {evs.length === 0 ? (
              <p style={{ color: 'var(--danger)', fontSize: '0.88rem' }}>
                You need to add an EV first.
              </p>
            ) : (
              <select
                id="book-ev"
                className="form-select"
                value={bookForm.evId}
                onChange={(e) => setBookForm({ ...bookForm, evId: e.target.value })}
                required
              >
                <option value="">-- Select EV --</option>
                {evs.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.model} ({ev.batteryPercentage}%)
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="book-start">
              Start Time
            </label>
            <input
              id="book-start"
              type="datetime-local"
              className="form-control"
              value={bookForm.startTime}
              min={nowForDatetimeLocal()}
              onChange={(e) => setBookForm({ ...bookForm, startTime: e.target.value })}
              required
            />
          </div>
          <div className="mb-4">
            <label className="form-label" htmlFor="book-duration">
              Duration
            </label>
            <select
              id="book-duration"
              className="form-select"
              value={bookForm.durationMinutes}
              onChange={(e) =>
                setBookForm({ ...bookForm, durationMinutes: parseInt(e.target.value) })
              }
            >
              <option value={30}>30 minutes</option>
              <option value={60}>1 hour</option>
              <option value={90}>1.5 hours</option>
              <option value={120}>2 hours</option>
              <option value={180}>3 hours</option>
              <option value={240}>4 hours</option>
            </select>
            <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
              The slot is reserved for this window; others can book around it. Final cost is based
              on actual charging time.
            </small>
          </div>
          <div
            style={{
              marginBottom: 20,
              padding: 16,
              background: 'var(--bg-elevated)',
              borderRadius: 4,
            }}
          >
            <p
              style={{
                color: 'var(--text-muted)',
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Zap size={13} /> Power:{' '}
              <strong style={{ color: 'var(--text-primary)' }}>{bookingModal?.powerKw} kW</strong>
            </p>
            <p
              style={{
                color: 'var(--text-muted)',
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Wallet size={13} /> Rate:{' '}
              <strong style={{ color: 'var(--gold)' }}>{toPKR(s.pricePerKwh)}/kWh</strong>
            </p>
            <p
              style={{
                color: 'var(--text-muted)',
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                marginTop: 4,
              }}
            >
              Estimated cost:{' '}
              <strong style={{ color: 'var(--primary-dark)' }}>
                {toPKR(
                  (bookingModal?.powerKw || 0) * (bookForm.durationMinutes / 60) * s.pricePerKwh
                )}
              </strong>
              <span style={{ fontSize: '0.72rem' }}>
                ({bookForm.durationMinutes} min @ {bookingModal?.powerKw} kW)
              </span>
            </p>
          </div>
          {(() => {
            if (!bookingModal || !bookForm.startTime) return null;
            const start = new Date(bookForm.startTime);
            const plannedEnd = new Date(start.getTime() + bookForm.durationMinutes * 60 * 1000);
            const conflict = findConflict(bookingModal.id, start, plannedEnd);
            if (!conflict) return null;
            const until = conflict.plannedEndTime
              ? ` until ${new Date(conflict.plannedEndTime).toLocaleString()}`
              : ' (open-ended)';
            return (
              <p style={{ color: 'var(--danger)', fontSize: '0.82rem', marginBottom: 16 }}>
                This slot is already booked from {new Date(conflict.startTime).toLocaleString()}
                {until} — pick a different time or duration.
              </p>
            );
          })()}
          <button
            type="submit"
            className="btn-gold"
            style={{
              width: '100%',
              padding: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
            disabled={
              evs.length === 0 ||
              (bookingModal &&
                bookForm.startTime &&
                !!findConflict(
                  bookingModal.id,
                  new Date(bookForm.startTime),
                  new Date(
                    new Date(bookForm.startTime).getTime() + bookForm.durationMinutes * 60000
                  )
                ))
            }
          >
            Confirm Booking <CheckCircle2 size={16} />
          </button>
        </form>
      </Modal>

      {/* Bid Modal */}
      <Modal
        show={!!bidModal}
        onClose={() => setBidModal(null)}
        title={`Bid on Slot #${bidModal?.slotNumber}`}
      >
        <div style={{ marginBottom: 20 }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: 12 }}>
            Priority is calculated:{' '}
            <strong style={{ color: 'var(--text-primary)' }}>
              60% bid amount + 40% battery urgency
            </strong>
            . Lower battery = higher priority.
          </p>
          {/* Leaderboard */}
          {slotBids.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <p
                style={{
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  marginBottom: 8,
                  color: 'var(--gold)',
                }}
              >
                Current Bids (Priority Order):
              </p>
              {slotBids.slice(0, 5).map((bid, i) => (
                <div
                  key={bid.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '8px 0',
                    borderBottom: '1px solid var(--border)',
                    fontSize: '0.82rem',
                  }}
                >
                  {/* Bidder identity is intentionally not exposed publicly —
                      just rank; amount + priority already show competitiveness. */}
                  <span style={{ color: i === 0 ? 'var(--gold)' : 'var(--text-secondary)' }}>
                    Bid #{i + 1}
                  </span>
                  <span style={{ color: 'var(--text-primary)' }}>
                    {toPKR(bid.amount)} · Priority: {bid.priority?.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <form onSubmit={handleBid}>
          <div className="mb-3">
            <label className="form-label" htmlFor="bid-amount">
              Your Bid Amount
            </label>
            <input
              id="bid-amount"
              type="number"
              className="form-control"
              placeholder="e.g. 500"
              step="0.01"
              min="0.01"
              value={bidForm.amount}
              onChange={(e) => setBidForm({ ...bidForm, amount: e.target.value })}
              required
            />
            {bidForm.amount > 0 && (
              <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                ≈ {toPKR(bidForm.amount)}
              </small>
            )}
          </div>
          <div className="mb-4">
            <label className="form-label" htmlFor="bid-battery">
              Your Battery Level (%)
            </label>
            <input
              id="bid-battery"
              type="number"
              className="form-control"
              placeholder="e.g. 18"
              min="1"
              max="100"
              value={bidForm.batteryLevel}
              onChange={(e) => setBidForm({ ...bidForm, batteryLevel: e.target.value })}
              required
            />
            <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
              Lower battery gets higher priority weight
            </small>
          </div>
          <button
            type="submit"
            className="btn-gold"
            style={{
              width: '100%',
              padding: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
            disabled={bidLoading}
          >
            {bidLoading ? (
              'Placing Bid...'
            ) : (
              <>
                Place Bid <Trophy size={16} />
              </>
            )}
          </button>
        </form>
      </Modal>
    </div>
  );
}
