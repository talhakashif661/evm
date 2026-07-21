import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import {
  Zap,
  CheckCircle2,
  Plug,
  Wallet,
  MapPin,
  Trophy,
  Plus,
  Hourglass,
  Pencil,
  Trash2,
  Loader2,
} from 'lucide-react';
import {
  fetchMyStation,
  createStation,
  addSlot,
  openSlotAuction,
  closeSlotAuction,
} from '../store/slices/stationSlice';
import { StatCard, SlotStatusBadge, Modal } from '../components/Spinner';
import { Skeleton, SkeletonRow } from '../components/Skeleton';
import api from '../utils/api';
import { getSocket } from '../utils/socket';
import { toast } from 'react-toastify';
import { toPKR } from '../utils/pkr';
import { compressImageToUnder } from '../utils/imageCompress';
import AddressAutocomplete from '../components/AddressAutocomplete';
import { logger } from '../utils/logger';
import SEO from '../components/SEO';

// Mirrors backend/controllers/station.controller.js's ALLOWED_AMENITIES —
// keep these two lists in sync if either changes.
const ALLOWED_AMENITIES = [
  'Fast Charging',
  'Restroom',
  'Cafe',
  'WiFi',
  'Parking',
  '24/7 Access',
  'CCTV',
  'Covered Parking',
];
const MAX_STATION_IMAGES = 5;
const MAX_STATION_IMAGE_BYTES = 80 * 1024;

function AmenitiesPicker({ value, onChange }) {
  const toggle = (a) => onChange(value.includes(a) ? value.filter((x) => x !== a) : [...value, a]);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {ALLOWED_AMENITIES.map((a) => (
        <button
          key={a}
          type="button"
          onClick={() => toggle(a)}
          style={{
            padding: '6px 12px',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: '0.78rem',
            fontWeight: 600,
            background: value.includes(a) ? 'var(--primary-glow)' : 'var(--bg-elevated)',
            border: `1px solid ${value.includes(a) ? 'var(--primary)' : 'var(--border)'}`,
            color: value.includes(a) ? 'var(--primary)' : 'var(--text-muted)',
          }}
        >
          {a}
        </button>
      ))}
    </div>
  );
}

function ImagesPicker({ value, onChange }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null); // { current, total } while compressing multiple photos

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const room = MAX_STATION_IMAGES - value.length;
    if (room <= 0) {
      toast.error(`Maximum ${MAX_STATION_IMAGES} photos`);
      return;
    }

    setBusy(true);
    const filesToProcess = files.slice(0, room).filter((f) => f.type.startsWith('image/'));
    try {
      const compressed = [];
      for (let i = 0; i < filesToProcess.length; i++) {
        setProgress({ current: i + 1, total: filesToProcess.length });
        compressed.push(
          await compressImageToUnder(filesToProcess[i], MAX_STATION_IMAGE_BYTES, { startSide: 480 })
        );
      }
      onChange([...value, ...compressed]);
    } catch (err) {
      toast.error(err.message || 'Failed to process image');
    }
    setBusy(false);
    setProgress(null);
  };

  const remove = (idx) => onChange(value.filter((_, i) => i !== idx));

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        {value.map((img, i) => (
          <div key={i} style={{ position: 'relative', width: 64, height: 64 }}>
            <img
              src={img}
              alt={`Station photo ${i + 1}`}
              loading="lazy"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                borderRadius: 8,
                border: '1px solid var(--border)',
              }}
            />
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label="Remove photo"
              style={{
                position: 'absolute',
                top: -6,
                right: -6,
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: 'var(--danger)',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.7rem',
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        ))}
        {value.length < MAX_STATION_IMAGES && (
          <label
            style={{
              width: 64,
              height: 64,
              borderRadius: 8,
              border: '1.5px dashed var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: busy ? 'default' : 'pointer',
              color: 'var(--text-muted)',
            }}
          >
            {busy ? <Loader2 size={18} className="spin" /> : <Plus size={18} />}
            <input
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={handleFiles}
              disabled={busy}
            />
          </label>
        )}
      </div>
      <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
        {progress && progress.total > 1
          ? `Compressing photo ${progress.current} of ${progress.total}...`
          : `Up to ${MAX_STATION_IMAGES} photos, auto-compressed for storage.`}
      </small>
    </div>
  );
}

export default function OwnerDashboard() {
  const dispatch = useDispatch();
  const { myStation, loading } = useSelector((s) => s.stations);
  const [showCreate, setShowCreate] = useState(false);
  const [showSlot, setShowSlot] = useState(false);
  const [bookings, setBookings] = useState([]);
  const [revenue, setRevenue] = useState(0);
  const [stationForm, setStationForm] = useState({
    name: '',
    address: '',
    city: '',
    latitude: '',
    longitude: '',
    pricePerKwh: '',
    amenities: [],
    images: [],
  });
  const [slotForm, setSlotForm] = useState({ slotNumber: '', powerKw: '' });
  const [auctionModal, setAuctionModal] = useState(null);
  const [auctionDuration, setAuctionDuration] = useState(30);
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    address: '',
    city: '',
    latitude: '',
    longitude: '',
    pricePerKwh: '',
    amenities: [],
    images: [],
  });

  useEffect(() => {
    dispatch(fetchMyStation());
  }, [dispatch]);

  useEffect(() => {
    if (myStation) {
      fetchBookings();
      fetchRevenue();
    }
  }, [myStation]);

  // Live-notify the owner the instant a bid lands on one of their slots,
  // instead of them having to refresh to see auction activity.
  useEffect(() => {
    if (!myStation) return;
    const socket = getSocket();
    socket.emit('join:station', myStation.id);

    const handleNewBid = () => {
      toast.info('New bid placed on one of your auction slots!');
      dispatch(fetchMyStation());
    };
    socket.on('bid:new', handleNewBid);

    return () => {
      socket.emit('leave:station', myStation.id);
      socket.off('bid:new', handleNewBid);
    };
    // myStation?.id (not the full object) is deliberate — same
    // room-joining pattern/reasoning as AuctionHub.jsx's user?.id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, myStation?.id]);

  // Approve/reject now both notify the owner (previously only approval did —
  // a rejected owner had to happen to revisit this page to find out at all).
  // No join needed: the socket auto-joins this user's own room on connect.
  useEffect(() => {
    const socket = getSocket();
    const handleStatusChanged = ({ status }) => {
      toast[status === 'APPROVED' ? 'success' : 'warning'](
        status === 'APPROVED'
          ? 'Your station was approved!'
          : 'Your station was not approved — see details below.'
      );
      dispatch(fetchMyStation());
    };
    socket.on('station:status-changed', handleStatusChanged);
    return () => socket.off('station:status-changed', handleStatusChanged);
  }, [dispatch]);

  const fetchBookings = async () => {
    try {
      const res = await api.get('/stations/owner/bookings?limit=10');
      setBookings(res.data.data || []);
    } catch (e) {
      // Recent-activity widget only — non-critical decoration, same as
      // fetchReviews elsewhere in this app; logged for dev visibility
      // without an intrusive toast for a secondary summary number.
      logger.error(e);
    }
  };

  // The dashboard used to show ChargingStation.totalRevenue directly — a
  // denormalized counter that can drift from reality (e.g. it's never
  // decremented if a paying customer's account is later deleted). This
  // live-aggregated endpoint (already used correctly by StationReport.jsx)
  // is always accurate, computed fresh from real Payment records.
  const fetchRevenue = async () => {
    try {
      const res = await api.get('/stations/owner/revenue');
      setRevenue(res.data.data?.totalRevenue || 0);
    } catch (e) {
      // Same reasoning as fetchBookings above — supplementary stat, not
      // core page data.
      logger.error(e);
    }
  };

  const handleCompleteBooking = async (bookingId) => {
    try {
      await api.patch(`/bookings/${bookingId}/complete`);
      toast.success('Booking marked as completed');
      fetchBookings();
      fetchRevenue();
      dispatch(fetchMyStation());
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not complete booking');
    }
  };

  const handleOwnerCancelBooking = async (bookingId) => {
    if (
      !window.confirm(
        'Cancel this booking? If the customer already paid, they will be refunded automatically.'
      )
    )
      return;
    try {
      const res = await api.patch(`/bookings/${bookingId}/owner-cancel`);
      toast.success(
        res.data.data?.refunded ? 'Booking cancelled and customer refunded' : 'Booking cancelled'
      );
      fetchBookings();
      fetchRevenue();
      dispatch(fetchMyStation());
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not cancel booking');
    }
  };

  const handleCreateStation = async (e) => {
    e.preventDefault();
    const res = await dispatch(createStation(stationForm));
    if (!res.error) setShowCreate(false);
  };

  const handleAddSlot = async (e) => {
    e.preventDefault();
    const res = await dispatch(addSlot(slotForm));
    if (!res.error) {
      setShowSlot(false);
      dispatch(fetchMyStation());
    }
  };

  const handleOpenAuction = async () => {
    await dispatch(openSlotAuction({ slotId: auctionModal.id, durationMinutes: auctionDuration }));
    setAuctionModal(null);
    dispatch(fetchMyStation());
  };

  const handleCloseAuction = async (slotId) => {
    await dispatch(closeSlotAuction(slotId));
    dispatch(fetchMyStation());
    fetchBookings();
  };

  const handleUpdateSlotStatus = async (slotId, status) => {
    try {
      await api.put(`/slots/${slotId}/status`, { status });
      toast.success('Slot status updated');
      dispatch(fetchMyStation());
    } catch (e) {
      logger.error(e);
      toast.error('Failed to update slot');
    }
  };

  // PUT /api/stations/owner/mine existed since day one but no UI ever called
  // it — owners literally could not change their price or address. Now they can.
  const handleEditStation = async (e) => {
    e.preventDefault();
    try {
      await api.put('/stations/owner/mine', editForm);
      toast.success('Station updated');
      setShowEdit(false);
      dispatch(fetchMyStation());
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not update station');
    }
  };

  const handleDeleteSlot = async (slot) => {
    if (!window.confirm(`Delete Slot #${slot.slotNumber}? This cannot be undone.`)) return;
    try {
      await api.delete(`/slots/${slot.id}`);
      toast.success('Slot deleted');
      dispatch(fetchMyStation());
    } catch (err) {
      // Backend refuses (409) when the slot has live/upcoming bookings.
      toast.error(err.response?.data?.message || 'Could not delete slot');
    }
  };

  if (loading)
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '44px 32px' }}>
        <Skeleton height={40} width="40%" style={{ marginBottom: 28 }} />
        <div className="ev-card" style={{ padding: 24, marginBottom: 24 }}>
          <Skeleton height={22} width="35%" style={{ marginBottom: 10 }} />
          <Skeleton height={14} width="55%" style={{ marginBottom: 20 }} />
          <div className="row g-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="col-12 col-md-4">
                <Skeleton height={70} radius={8} />
              </div>
            ))}
          </div>
        </div>
        <div className="ev-card" style={{ padding: 24 }}>
          {[...Array(3)].map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      </div>
    );

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '44px 32px' }}>
      <SEO
        title="Manage Your Station"
        description="Register and manage your EV charging station — track slots, bookings, revenue, and approval status."
        noIndex
      />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 32,
        }}
      >
        <div>
          <h1 className="section-title">
            Station <span>Management</span>
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Manage your charging station
          </p>
        </div>
        {myStation && (
          <button
            className="btn-gold"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => setShowSlot(true)}
          >
            <Plus size={16} /> Add Slot
          </button>
        )}
      </div>

      {!myStation ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{ textAlign: 'center', padding: '60px 20px' }}
        >
          <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'center' }}>
            <Zap size={56} color="var(--gold)" strokeWidth={1.5} />
          </div>
          <h2
            style={{
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontWeight: 700,
              fontSize: '1.9rem',
              letterSpacing: '0.02em',
              marginBottom: 12,
            }}
          >
            Register Your Charging Station
          </h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 28 }}>
            Start accepting EV bookings from users near you.
          </p>
          <button
            className="btn-gold"
            onClick={() => setShowCreate(true)}
            style={{ padding: '14px 32px' }}
          >
            Register Station
          </button>
        </motion.div>
      ) : (
        <>
          {/* Station overview */}
          <div className="row g-3 mb-4">
            <div className="col-6 col-md-3">
              <StatCard
                label="Total Slots"
                value={myStation.slots?.length || 0}
                icon={<Zap size={24} />}
              />
            </div>
            <div className="col-6 col-md-3">
              <StatCard
                label="Available"
                value={myStation.slots?.filter((s) => s.status === 'AVAILABLE').length || 0}
                icon={<CheckCircle2 size={24} />}
                color="var(--success)"
              />
            </div>
            <div className="col-6 col-md-3">
              <StatCard
                label="Occupied"
                value={myStation.slots?.filter((s) => s.status === 'OCCUPIED').length || 0}
                icon={<Plug size={24} />}
                color="var(--warning)"
              />
            </div>
            <div className="col-6 col-md-3">
              <StatCard
                label="Revenue"
                value={toPKR(revenue)}
                icon={<Wallet size={24} />}
                color="var(--gold)"
              />
            </div>
          </div>

          {/* Station info */}
          <motion.div className="ev-card" style={{ padding: 24, marginBottom: 28 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <div>
                <h3
                  style={{
                    fontFamily: 'Georgia, "Times New Roman", serif',
                    fontWeight: 700,
                    fontSize: '1.8rem',
                    letterSpacing: '0.02em',
                    marginBottom: 6,
                  }}
                >
                  {myStation.name}
                </h3>
                <p
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: '0.88rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <MapPin size={13} /> {myStation.address}, {myStation.city}
                </p>
                <p
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: '0.88rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Wallet size={13} /> {toPKR(myStation.pricePerKwh)}/kWh
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  className="btn-outline"
                  style={{
                    padding: '6px 14px',
                    fontSize: '0.8rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                  onClick={() => {
                    setEditForm({
                      name: myStation.name,
                      address: myStation.address,
                      city: myStation.city,
                      latitude: myStation.latitude,
                      longitude: myStation.longitude,
                      pricePerKwh: myStation.pricePerKwh,
                      amenities: myStation.amenities || [],
                      images: myStation.images || [],
                    });
                    setShowEdit(true);
                  }}
                >
                  <Pencil size={13} /> Edit
                </button>
                <span
                  className={`badge-${myStation.status === 'APPROVED' ? 'success' : myStation.status === 'PENDING' ? 'warning' : 'danger'}`}
                  style={{
                    fontSize: '0.85rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  {myStation.status === 'PENDING' ? (
                    <>
                      <Hourglass size={13} /> Awaiting Approval
                    </>
                  ) : (
                    myStation.status
                  )}
                </span>
              </div>
            </div>
            {myStation.status === 'REJECTED' && (
              <p
                style={{
                  color: 'var(--danger)',
                  fontSize: '0.82rem',
                  marginTop: 12,
                  marginBottom: 0,
                }}
              >
                This station wasn&apos;t approved. Update its details and save — that resubmits it
                for another review.
              </p>
            )}
          </motion.div>

          {/* Slots table */}
          <motion.div className="ev-card" style={{ padding: 24, marginBottom: 28 }}>
            <h3
              style={{
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontWeight: 700,
                fontSize: '1.5rem',
                letterSpacing: '0.02em',
                marginBottom: 22,
              }}
            >
              Charging Slots
            </h3>
            {myStation.slots?.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>
                No slots yet. Add your first slot above.
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="ev-table">
                  <thead>
                    <tr>
                      <th>Slot</th>
                      <th>Power</th>
                      <th>Status</th>
                      <th>Auction</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myStation.slots?.map((slot) => (
                      <tr key={slot.id}>
                        <td style={{ fontWeight: 600 }}>#{slot.slotNumber}</td>
                        <td>{slot.powerKw} kW</td>
                        <td>
                          <SlotStatusBadge status={slot.status} />
                        </td>
                        <td>
                          {slot.auctionOpen ? (
                            <span
                              className="badge-warning"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            >
                              <Zap size={12} /> LIVE · {slot.bids?.length || 0} bids
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                              —
                            </span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {['AVAILABLE', 'OCCUPIED', 'MAINTENANCE'].map((s) => (
                              <button
                                key={s}
                                onClick={() => handleUpdateSlotStatus(slot.id, s)}
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: 4,
                                  cursor: 'pointer',
                                  fontSize: '0.72rem',
                                  fontWeight: 600,
                                  background:
                                    slot.status === s
                                      ? 'var(--primary-glow)'
                                      : 'var(--bg-elevated)',
                                  border: `1px solid ${slot.status === s ? 'var(--primary)' : 'var(--border)'}`,
                                  color: slot.status === s ? 'var(--primary)' : 'var(--text-muted)',
                                }}
                              >
                                {s}
                              </button>
                            ))}
                            {!slot.auctionOpen ? (
                              <button
                                onClick={() => setAuctionModal(slot)}
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: 4,
                                  cursor: 'pointer',
                                  fontSize: '0.72rem',
                                  fontWeight: 600,
                                  background: '#F1E3D3',
                                  border: '1px solid #DEC49E',
                                  color: 'var(--warning)',
                                }}
                              >
                                Open Auction
                              </button>
                            ) : (
                              <button
                                onClick={() => handleCloseAuction(slot.id)}
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: 4,
                                  cursor: 'pointer',
                                  fontSize: '0.72rem',
                                  fontWeight: 600,
                                  background: '#F3E1DE',
                                  border: '1px solid #E0BAB4',
                                  color: 'var(--danger)',
                                }}
                              >
                                Close Auction
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteSlot(slot)}
                              title="Delete slot"
                              style={{
                                padding: '4px 10px',
                                borderRadius: 4,
                                cursor: 'pointer',
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                background: '#F3E1DE',
                                border: '1px solid #E0BAB4',
                                color: 'var(--danger)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <Trash2 size={11} /> Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>

          {/* Recent bookings */}
          <motion.div className="ev-card" style={{ padding: 24 }}>
            <h3
              style={{
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontWeight: 700,
                fontSize: '1.5rem',
                letterSpacing: '0.02em',
                marginBottom: 22,
              }}
            >
              Recent Bookings
            </h3>
            {bookings.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>
                No bookings yet
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="ev-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>EV</th>
                      <th>Slot</th>
                      <th>Time</th>
                      <th>Status</th>
                      <th>Cost</th>
                      <th>Payment</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings.map((b) => (
                      <tr key={b.id}>
                        <td>{b.user?.name}</td>
                        <td>{b.ev?.model}</td>
                        <td>#{b.slot?.slotNumber}</td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {new Date(b.startTime).toLocaleDateString()}
                        </td>
                        <td>
                          <span
                            className={`badge-${b.status === 'COMPLETED' ? 'gold' : b.status === 'CANCELLED' ? 'danger' : 'info'}`}
                          >
                            {b.status}
                          </span>
                        </td>
                        <td style={{ color: 'var(--primary)', fontWeight: 600 }}>
                          {b.totalCost ? toPKR(b.totalCost) : '—'}
                        </td>
                        <td>
                          {b.status === 'COMPLETED' ? (
                            b.payment ? (
                              <span
                                className="badge-success"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                              >
                                <CheckCircle2 size={12} /> Paid
                              </span>
                            ) : (
                              <span className="badge-danger">Unpaid</span>
                            )
                          ) : (
                            '—'
                          )}
                        </td>
                        <td style={{ display: 'flex', gap: 6 }}>
                          {b.status === 'ACTIVE' && (
                            <button
                              className="btn-success-sm"
                              onClick={() => handleCompleteBooking(b.id)}
                            >
                              Complete
                            </button>
                          )}
                          {['CONFIRMED', 'CHECKED_IN', 'ACTIVE'].includes(b.status) && (
                            <button
                              className="btn-danger-sm"
                              onClick={() => handleOwnerCancelBooking(b.id)}
                            >
                              Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        </>
      )}

      {/* Create station modal */}
      <Modal
        show={showCreate}
        onClose={() => setShowCreate(false)}
        title="Register Charging Station"
      >
        <form onSubmit={handleCreateStation}>
          <div className="mb-3">
            <label className="form-label" htmlFor="create-name">
              Station Name
            </label>
            <input
              id="create-name"
              className="form-control"
              placeholder="Downtown EV Hub"
              value={stationForm.name}
              onChange={(e) => setStationForm({ ...stationForm, name: e.target.value })}
              required
            />
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="create-address">
              Address
            </label>
            <AddressAutocomplete
              id="create-address"
              value={stationForm.address}
              onChange={(text) => setStationForm({ ...stationForm, address: text })}
              onSelect={({ address, city, latitude, longitude }) =>
                setStationForm({
                  ...stationForm,
                  address,
                  city: city || stationForm.city,
                  latitude,
                  longitude,
                })
              }
              placeholder="123 Main St"
            />
          </div>
          <div className="row g-3 mb-3">
            <div className="col-12 col-sm-6">
              <label className="form-label" htmlFor="create-city">
                City
              </label>
              <input
                id="create-city"
                className="form-control"
                placeholder="New York"
                value={stationForm.city}
                onChange={(e) => setStationForm({ ...stationForm, city: e.target.value })}
                required
              />
            </div>
            <div className="col-12 col-sm-6">
              <label className="form-label" htmlFor="create-price">
                Price/kWh
              </label>
              <input
                id="create-price"
                type="number"
                step="0.01"
                className="form-control"
                placeholder="40"
                value={stationForm.pricePerKwh}
                onChange={(e) => setStationForm({ ...stationForm, pricePerKwh: e.target.value })}
                required
              />
              {stationForm.pricePerKwh > 0 && (
                <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                  ≈ {toPKR(stationForm.pricePerKwh)}/kWh
                </small>
              )}
            </div>
          </div>
          <div className="row g-3 mb-4">
            <div className="col-12 col-sm-6">
              <label className="form-label" htmlFor="create-lat">
                Latitude
              </label>
              <input
                id="create-lat"
                type="number"
                step="any"
                className="form-control"
                placeholder="40.7128"
                value={stationForm.latitude}
                onChange={(e) => setStationForm({ ...stationForm, latitude: e.target.value })}
                required
              />
            </div>
            <div className="col-12 col-sm-6">
              <label className="form-label" htmlFor="create-lng">
                Longitude
              </label>
              <input
                id="create-lng"
                type="number"
                step="any"
                className="form-control"
                placeholder="-74.0060"
                value={stationForm.longitude}
                onChange={(e) => setStationForm({ ...stationForm, longitude: e.target.value })}
                required
              />
            </div>
          </div>
          <fieldset className="mb-3" style={{ border: 'none', padding: 0, margin: 0 }}>
            <legend
              className="form-label"
              style={{ padding: 0, marginBottom: 4, fontSize: 'inherit', float: 'none' }}
            >
              Amenities
            </legend>
            <AmenitiesPicker
              value={stationForm.amenities}
              onChange={(amenities) => setStationForm({ ...stationForm, amenities })}
            />
          </fieldset>
          <fieldset className="mb-4" style={{ border: 'none', padding: 0, margin: 0 }}>
            <legend
              className="form-label"
              style={{ padding: 0, marginBottom: 4, fontSize: 'inherit', float: 'none' }}
            >
              Photos
            </legend>
            <ImagesPicker
              value={stationForm.images}
              onChange={(images) => setStationForm({ ...stationForm, images })}
            />
          </fieldset>
          <button type="submit" className="btn-gold" style={{ width: '100%', padding: 12 }}>
            Submit for Approval
          </button>
        </form>
      </Modal>

      {/* Edit station modal */}
      <Modal show={showEdit} onClose={() => setShowEdit(false)} title="Edit Station Details">
        <form onSubmit={handleEditStation}>
          <div className="mb-3">
            <label className="form-label" htmlFor="edit-name">
              Station Name
            </label>
            <input
              id="edit-name"
              className="form-control"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              required
            />
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="edit-address">
              Address
            </label>
            <AddressAutocomplete
              id="edit-address"
              value={editForm.address}
              onChange={(text) => setEditForm({ ...editForm, address: text })}
              onSelect={({ address, city, latitude, longitude }) =>
                setEditForm({
                  ...editForm,
                  address,
                  city: city || editForm.city,
                  latitude,
                  longitude,
                })
              }
            />
          </div>
          <div className="row g-3 mb-3">
            <div className="col-12 col-sm-6">
              <label className="form-label" htmlFor="edit-city">
                City
              </label>
              <input
                id="edit-city"
                className="form-control"
                value={editForm.city}
                onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                required
              />
            </div>
            <div className="col-12 col-sm-6">
              <label className="form-label" htmlFor="edit-price">
                Price/kWh
              </label>
              <input
                id="edit-price"
                type="number"
                step="0.01"
                min="0"
                className="form-control"
                value={editForm.pricePerKwh}
                onChange={(e) => setEditForm({ ...editForm, pricePerKwh: e.target.value })}
                required
              />
              {editForm.pricePerKwh > 0 && (
                <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                  ≈ {toPKR(editForm.pricePerKwh)}/kWh
                </small>
              )}
            </div>
          </div>
          <div className="row g-3 mb-4">
            <div className="col-12 col-sm-6">
              <label className="form-label" htmlFor="edit-lat">
                Latitude
              </label>
              <input
                id="edit-lat"
                type="number"
                step="any"
                className="form-control"
                value={editForm.latitude}
                onChange={(e) => setEditForm({ ...editForm, latitude: e.target.value })}
                required
              />
            </div>
            <div className="col-12 col-sm-6">
              <label className="form-label" htmlFor="edit-lng">
                Longitude
              </label>
              <input
                id="edit-lng"
                type="number"
                step="any"
                className="form-control"
                value={editForm.longitude}
                onChange={(e) => setEditForm({ ...editForm, longitude: e.target.value })}
                required
              />
            </div>
          </div>
          <fieldset className="mb-3" style={{ border: 'none', padding: 0, margin: 0 }}>
            <legend
              className="form-label"
              style={{ padding: 0, marginBottom: 4, fontSize: 'inherit', float: 'none' }}
            >
              Amenities
            </legend>
            <AmenitiesPicker
              value={editForm.amenities}
              onChange={(amenities) => setEditForm({ ...editForm, amenities })}
            />
          </fieldset>
          <fieldset className="mb-4" style={{ border: 'none', padding: 0, margin: 0 }}>
            <legend
              className="form-label"
              style={{ padding: 0, marginBottom: 4, fontSize: 'inherit', float: 'none' }}
            >
              Photos
            </legend>
            <ImagesPicker
              value={editForm.images}
              onChange={(images) => setEditForm({ ...editForm, images })}
            />
          </fieldset>
          <button type="submit" className="btn-gold" style={{ width: '100%', padding: 12 }}>
            Save Changes
          </button>
        </form>
      </Modal>

      {/* Add slot modal */}
      <Modal show={showSlot} onClose={() => setShowSlot(false)} title="Add Charging Slot">
        <form onSubmit={handleAddSlot}>
          <div className="mb-3">
            <label className="form-label" htmlFor="slot-number">
              Slot Number
            </label>
            <input
              id="slot-number"
              type="number"
              className="form-control"
              placeholder="1"
              min="1"
              value={slotForm.slotNumber}
              onChange={(e) => setSlotForm({ ...slotForm, slotNumber: e.target.value })}
              required
            />
          </div>
          <div className="mb-4">
            <label className="form-label" htmlFor="slot-power">
              Power (kW)
            </label>
            <input
              id="slot-power"
              type="number"
              className="form-control"
              placeholder="50"
              min="1"
              value={slotForm.powerKw}
              onChange={(e) => setSlotForm({ ...slotForm, powerKw: e.target.value })}
              required
            />
          </div>
          <button type="submit" className="btn-gold" style={{ width: '100%', padding: 12 }}>
            Add Slot
          </button>
        </form>
      </Modal>

      {/* Auction modal */}
      <Modal
        show={!!auctionModal}
        onClose={() => setAuctionModal(null)}
        title={`Open Auction - Slot #${auctionModal?.slotNumber}`}
      >
        <div>
          <p style={{ color: 'var(--text-muted)', marginBottom: 20, fontSize: '0.9rem' }}>
            Set auction duration. The highest priority bid wins.
          </p>
          <div className="mb-4">
            <label className="form-label" htmlFor="auction-duration">
              Duration:{' '}
              <strong style={{ color: 'var(--primary)' }}>{auctionDuration} minutes</strong>
            </label>
            <input
              id="auction-duration"
              type="range"
              min="10"
              max="120"
              step="10"
              value={auctionDuration}
              onChange={(e) => setAuctionDuration(parseInt(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--primary)' }}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                color: 'var(--text-muted)',
                fontSize: '0.75rem',
              }}
            >
              <span>10 min</span>
              <span>120 min</span>
            </div>
          </div>
          <button
            className="btn-gold"
            style={{
              width: '100%',
              padding: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
            onClick={handleOpenAuction}
          >
            Open Auction <Trophy size={16} />
          </button>
        </div>
      </Modal>
    </div>
  );
}
