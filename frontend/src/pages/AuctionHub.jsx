import { useEffect, useState, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { Zap, Target, Trophy, MapPin, Clock, ArrowRight, XCircle, BarChart3 } from 'lucide-react';
import { fetchMyBids, fetchAuctionResults, cancelBid } from '../store/slices/bidSlice';
import { fetchStations } from '../store/slices/stationSlice';
import { EmptyState, Countdown } from '../components/Spinner';
import { getSocket } from '../utils/socket';
import { toPKR } from '../utils/pkr';
import { playWinChime } from '../utils/winChime';
import { Link } from 'react-router-dom';
import SEO from '../components/SEO';

export default function AuctionHub() {
  const dispatch = useDispatch();
  const { bids, results } = useSelector((s) => s.bids);
  const { stations } = useSelector((s) => s.stations);
  const { user } = useSelector((s) => s.auth);
  const [tab, setTab] = useState('live');

  useEffect(() => {
    dispatch(fetchMyBids());
    dispatch(fetchAuctionResults());
    dispatch(fetchStations({ limit: 50 }));
  }, [dispatch]);

  // Live auction updates: join a socket room for every currently-open slot
  // so this page refreshes the moment someone else bids or an auction closes,
  // instead of only updating on a manual reload.
  // A stable key for "which slots currently have an auction open" — used as
  // this effect's dependency instead of `stations` itself (whose reference
  // changes on every fetch, which would tear down/rebuild the socket rooms
  // far more often than needed) or `stations.length` (which misses the real
  // case: station A's auction closing while station B's opens keeps the
  // total count the same, but the room subscriptions genuinely need to change).
  const openSlotIdsKey = useMemo(
    () =>
      stations
        .flatMap((s) => (s.slots || []).filter((sl) => sl.auctionOpen).map((sl) => sl.id))
        .sort()
        .join(','),
    [stations]
  );

  useEffect(() => {
    const socket = getSocket();
    const openSlotIds = openSlotIdsKey ? openSlotIdsKey.split(',') : [];
    openSlotIds.forEach((id) => socket.emit('join:slot', id));

    const refresh = () => dispatch(fetchStations({ limit: 50 }));
    const handleClosed = () => {
      toast.info('An auction you were watching has just closed.');
      refresh();
      dispatch(fetchMyBids());
      dispatch(fetchAuctionResults());
    };

    socket.on('bid:update', refresh);
    socket.on('auction:opened', refresh);
    socket.on('auction:closed', handleClosed);

    return () => {
      openSlotIds.forEach((id) => socket.emit('leave:slot', id));
      socket.off('bid:update', refresh);
      socket.off('auction:opened', refresh);
      socket.off('auction:closed', handleClosed);
    };
  }, [dispatch, openSlotIdsKey]);

  // Targeted win/loss notification, in addition to the generic slot-room
  // "an auction closed" toast above.
  useEffect(() => {
    if (!user) return;
    // No join:user emit needed — the server auto-joins this user's room
    // from their verified JWT on connection (see utils/socket.js).
    const socket = getSocket();

    const handleWon = ({ stationName, amount }) => {
      // Winning auto-creates a booking that still needs checking in and
      // paying for — the default 3s toast (see main.jsx) is too brief for
      // something this consequential, so this one stays up 4x longer and
      // links straight to the booking it created.
      playWinChime();
      toast.success(
        <span>
          You won the auction at {stationName} for {toPKR(amount)}!{' '}
          <Link
            to="/bookings"
            style={{ color: 'inherit', fontWeight: 700, textDecoration: 'underline' }}
          >
            View My Bookings
          </Link>
        </span>,
        { autoClose: 12000 }
      );
      dispatch(fetchMyBids());
      dispatch(fetchAuctionResults());
    };
    const handleLost = ({ stationName }) => {
      toast.info(`Auction at ${stationName} closed — another bid was selected this time.`);
      dispatch(fetchMyBids());
      dispatch(fetchAuctionResults());
    };

    socket.on('auction:won', handleWon);
    socket.on('auction:lost', handleLost);

    return () => {
      socket.off('auction:won', handleWon);
      socket.off('auction:lost', handleLost);
    };
    // user?.id (not the full `user` object) is deliberate: this effect only
    // cares about "is someone logged in, and who" — re-running on every
    // unrelated profile field update (avatar, phone, etc.) would tear down
    // and re-register these socket listeners for no reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, user?.id]);

  const auctionStations = useMemo(
    () => stations.filter((s) => s.slots?.some((sl) => sl.auctionOpen)),
    [stations]
  );
  const activeBids = bids.filter((b) => b.status === 'PENDING');

  const tabs = [
    { id: 'live', label: 'Live Auctions', icon: Zap, count: auctionStations.length },
    { id: 'mybids', label: 'My Bids', icon: Target, count: activeBids.length },
    { id: 'results', label: 'Results', icon: Trophy, count: results.length },
  ];

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '44px 32px' }}>
      <SEO
        title="Auction Hub"
        description="Bid on premium EV charging slots. Priority goes to critical battery levels — track your bids and auction results in real time."
        noIndex
      />
      <div style={{ marginBottom: 32 }}>
        <h1 className="section-title">
          Auction <span>Hub</span>
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Bid on charging slots — priority wins
        </p>
      </div>

      {/* Auction explanation */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{
          padding: 20,
          marginBottom: 28,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 6,
        }}
      >
        <p
          style={{
            color: 'var(--text-secondary)',
            fontSize: '0.88rem',
            marginBottom: 0,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
          }}
        >
          <Trophy size={18} style={{ flexShrink: 0, marginTop: 2, color: 'var(--gold)' }} />
          <span>
            <strong style={{ color: 'var(--gold)' }}>How Auctions Work:</strong> Station owners open
            slots for bidding. Priority score ={' '}
            <strong>60% bid amount + 40% battery urgency</strong>. Critical battery (≤20%) gets a
            major urgency boost — ensuring emergency vehicles always get priority.
          </span>
        </p>
      </motion.div>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          borderBottom: '1px solid var(--border)',
          marginBottom: 28,
        }}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '10px 20px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              borderBottom: tab === t.id ? '2px solid var(--gold)' : '2px solid transparent',
              color: tab === t.id ? 'var(--gold)' : 'var(--text-secondary)',
              fontFamily: 'Inter',
              fontWeight: 600,
              fontSize: '0.95rem',
              marginBottom: -1,
              transition: 'border-color 0.12s ease, color 0.12s ease',
            }}
          >
            <t.icon size={16} /> {t.label}{' '}
            {t.count > 0 && (
              <span style={{ fontSize: '0.75rem', marginLeft: 4, opacity: 0.8 }}>({t.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Live Auctions */}
      {tab === 'live' &&
        (auctionStations.length === 0 ? (
          <EmptyState
            icon={<Trophy size={48} color="var(--text-muted)" strokeWidth={1.5} />}
            title="No Active Auctions"
            subtitle={
              user?.role === 'STATION_OWNER'
                ? "Check back later, or open one on your own station's slots."
                : 'Check back later for live slot auctions.'
            }
            action={
              user?.role === 'STATION_OWNER' ? (
                <Link to="/owner/station">
                  <button className="btn-primary">
                    Manage My Station <ArrowRight size={14} />
                  </button>
                </Link>
              ) : undefined
            }
          />
        ) : (
          <div className="row g-4">
            {auctionStations.map((station) => (
              <div key={station.id} className="col-12 col-md-6">
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="ev-card"
                  style={{ padding: 24 }}
                >
                  <h2
                    style={{
                      fontFamily: 'Georgia, "Times New Roman", serif',
                      fontWeight: 700,
                      fontSize: '1.45rem',
                      letterSpacing: '0.02em',
                      marginBottom: 6,
                    }}
                  >
                    {station.name}
                  </h2>
                  <p
                    style={{
                      color: 'var(--text-muted)',
                      fontSize: '0.82rem',
                      marginBottom: 16,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <MapPin size={13} /> {station.city}
                  </p>
                  {station.slots
                    ?.filter((sl) => sl.auctionOpen)
                    .map((slot) => (
                      <div
                        key={slot.id}
                        style={{
                          padding: 12,
                          background: 'var(--warning-tint)',
                          border: '1px solid var(--warning-tint-border)',
                          borderRadius: 4,
                          marginBottom: 8,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 6,
                          }}
                        >
                          <span style={{ fontWeight: 600 }}>
                            Slot #{slot.slotNumber} · {slot.powerKw}kW
                          </span>
                          <span
                            style={{
                              color: 'var(--warning)',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <Trophy size={13} /> LIVE
                          </span>
                        </div>
                        {slot.auctionEnd && (
                          <p
                            style={{
                              color: 'var(--warning)',
                              fontSize: '0.75rem',
                              marginBottom: 8,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <Clock size={12} /> Ends in <Countdown deadline={slot.auctionEnd} />
                          </p>
                        )}
                        <Link to={`/stations/${station.id}`}>
                          <button
                            className="btn-primary"
                            style={{
                              width: '100%',
                              padding: '7px',
                              fontSize: '0.82rem',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 6,
                            }}
                          >
                            Place Bid <ArrowRight size={14} />
                          </button>
                        </Link>
                        <p className="cta-microcopy" style={{ textAlign: 'center', marginTop: 6 }}>
                          Charged only if you win
                        </p>
                      </div>
                    ))}
                </motion.div>
              </div>
            ))}
          </div>
        ))}

      {/* My Bids */}
      {tab === 'mybids' &&
        (activeBids.length === 0 ? (
          <EmptyState
            icon={<Target size={48} color="var(--text-muted)" strokeWidth={1.5} />}
            title="No Active Bids"
            subtitle="Visit a station with an active auction to place a bid."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {activeBids.map((bid, i) => (
              <motion.div
                key={bid.id}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="ev-card"
                style={{ padding: 20 }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 12,
                  }}
                >
                  <div>
                    <p style={{ fontWeight: 600, marginBottom: 4 }}>
                      {bid.slot?.station?.name} · Slot #{bid.slot?.slotNumber}
                    </p>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                      Bid: <strong style={{ color: 'var(--gold)' }}>{toPKR(bid.amount)}</strong> ·
                      Battery: {bid.batteryLevel}% · Priority:{' '}
                      <strong style={{ color: 'var(--info)' }}>{bid.priority?.toFixed(1)}</strong>
                    </p>
                  </div>
                  <button
                    onClick={() => dispatch(cancelBid(bid.id))}
                    style={{
                      padding: '6px 14px',
                      background: 'var(--danger-tint)',
                      border: '1px solid var(--danger-tint-border)',
                      borderRadius: 4,
                      color: 'var(--danger)',
                      cursor: 'pointer',
                      fontSize: '0.82rem',
                    }}
                  >
                    Cancel Bid
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        ))}

      {/* Results */}
      {tab === 'results' &&
        (results.length === 0 ? (
          <EmptyState
            icon={<BarChart3 size={48} color="var(--text-muted)" strokeWidth={1.5} />}
            title="No Auction Results Yet"
            subtitle="Results will appear here after auctions close."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {results.map((bid, i) => (
              <motion.div
                key={bid.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.05 }}
                className="ev-card"
                style={{
                  padding: 20,
                  borderLeft: `3px solid ${bid.status === 'WON' ? 'var(--gold)' : 'var(--danger)'}`,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 8,
                  }}
                >
                  <div>
                    <p style={{ fontWeight: 600, marginBottom: 4 }}>
                      {bid.slot?.station?.name} · Slot #{bid.slot?.slotNumber}
                    </p>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                      Your bid: {toPKR(bid.amount)}
                    </p>
                  </div>
                  <span
                    className={bid.status === 'WON' ? 'badge-gold' : 'badge-danger'}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    {bid.status === 'WON' ? (
                      <>
                        <Trophy size={12} /> WON
                      </>
                    ) : (
                      <>
                        <XCircle size={12} /> LOST
                      </>
                    )}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        ))}
    </div>
  );
}
