import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Zap, Car, Calendar, CheckCircle2, BatteryCharging, AlertTriangle, ArrowRight, Trophy, Bot, Plug, Wallet } from 'lucide-react';
import { fetchMyEVs } from '../store/slices/evSlice';
import { fetchMyBookings } from '../store/slices/bookingSlice';
import { fetchMyStation } from '../store/slices/stationSlice';
import { StatCard, BatteryBar } from '../components/Spinner';
import { Skeleton, SkeletonRow } from '../components/Skeleton';
import { toPKR } from '../utils/pkr';
import SEO from '../components/SEO';

const pageVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } }
};
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

export default function Dashboard() {
  const dispatch = useDispatch();
  const { user } = useSelector(s => s.auth);
  const { evs, loading: evsLoading } = useSelector(s => s.ev);
  const { bookings, loading: bookingsLoading } = useSelector(s => s.bookings);
  const { myStation, loading: stationLoading } = useSelector(s => s.stations);

  useEffect(() => {
    if (user?.role === 'EV_USER') {
      dispatch(fetchMyEVs());
      dispatch(fetchMyBookings({ limit: 5 }));
    }
    if (user?.role === 'STATION_OWNER') {
      dispatch(fetchMyStation());
    }
    // Unlike the user?.id-only cases elsewhere in this app, this effect's
    // actual branching logic depends on the role itself — if user populates
    // asynchronously after this component's first mount, the effect needs
    // to re-run once the role is known, not just fire once on mount.
  }, [dispatch, user?.role]);

  const activeBookings = bookings.filter(b => ['CONFIRMED', 'ACTIVE'].includes(b.status));
  const completedBookings = bookings.filter(b => b.status === 'COMPLETED');

  return (
    <motion.div variants={pageVariants} initial="hidden" animate="visible"
      style={{ maxWidth: 1280, margin: '0 auto', padding: '44px 32px' }}>
      <SEO
        title="Your EV Charging Dashboard"
        description="Track your charging sessions, view stats, and manage your EV charging activity — all from your ChargeEV dashboard."
        noIndex
      />

      {/* Header */}
      <motion.div variants={itemVariants} style={{ marginBottom: 36 }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 4 }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
        <h1 style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '2.8rem', fontWeight: 700, letterSpacing: '0.02em', display: 'flex', alignItems: 'center', gap: 10 }}>
          Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 18 ? 'Afternoon' : 'Evening'},{' '}
          <span style={{ color: 'var(--gold)' }}>{user?.name?.split(' ')[0]}</span> <Zap size={26} color="var(--gold)" />
        </h1>
      </motion.div>

      {/* EV User dashboard */}
      {user?.role === 'EV_USER' && (
        <>
          {/* Stats */}
          <motion.div variants={itemVariants} className="row g-3 mb-4">
            {(evsLoading || bookingsLoading) ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="col-6 col-md-3">
                  <div className="stat-card"><Skeleton height={14} width="60%" style={{ marginBottom: 10 }} /><Skeleton height={26} width="40%" /></div>
                </div>
              ))
            ) : (
              <>
            <div className="col-6 col-md-3">
              <StatCard label="My EVs" value={evs.length} icon={<Car size={22} />} />
            </div>
            <div className="col-6 col-md-3">
              <StatCard label="Active Bookings" value={activeBookings.length} icon={<Calendar size={22} />} color="var(--info)" />
            </div>
            <div className="col-6 col-md-3">
              <StatCard label="Completed" value={completedBookings.length} icon={<CheckCircle2 size={22} />} color="var(--success)" />
            </div>
            <div className="col-6 col-md-3">
              <StatCard
                label="Avg Battery"
                value={evs.length ? `${Math.round(evs.reduce((a, e) => a + e.batteryPercentage, 0) / evs.length)}%` : '--'}
                icon={<BatteryCharging size={22} />}
                color={evs.some(e => e.batteryPercentage < 20) ? 'var(--danger)' : 'var(--success)'}
              />
            </div>
              </>
            )}
          </motion.div>

          <div className="row g-4">
            {/* My EVs */}
            <div className="col-12 col-lg-5">
              <motion.div variants={itemVariants} className="ev-card" style={{ padding: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <h2 style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 700, fontSize: '1.5rem', letterSpacing: '0.02em' }}>My EVs</h2>
                  <Link to="/evs"><button className="btn-outline" style={{ padding: '6px 16px', fontSize: '0.8rem', gap: 4 }}>Manage <ArrowRight size={13} /></button></Link>
                </div>
                {evsLoading ? (
                  <><SkeletonRow /><SkeletonRow /><SkeletonRow /></>
                ) : evs.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px 0' }}>
                    <p style={{ color: 'var(--text-muted)', marginBottom: 12 }}>No EVs added yet</p>
                    <Link to="/evs"><button className="btn-gold" style={{ padding: '8px 20px', fontSize: '0.85rem' }}>Add EV</button></Link>
                  </div>
                ) : (
                  evs.slice(0, 3).map(ev => (
                    <div key={ev.id} style={{
                      padding: '14px 0', borderBottom: '1px solid var(--border)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div>
                          <p style={{ fontWeight: 600, marginBottom: 2 }}>{ev.model}</p>
                          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{ev.licensePlate || 'No plate'}</p>
                        </div>
                        {ev.batteryPercentage <= 20 && (
                          <span className="badge-danger" style={{ fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', gap: 3 }}><AlertTriangle size={11} /> LOW</span>
                        )}
                      </div>
                      <BatteryBar percentage={ev.batteryPercentage} />
                    </div>
                  ))
                )}
              </motion.div>
            </div>

            {/* Recent Bookings */}
            <div className="col-12 col-lg-7">
              <motion.div variants={itemVariants} className="ev-card" style={{ padding: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <h2 style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 700, fontSize: '1.5rem', letterSpacing: '0.02em' }}>Recent Bookings</h2>
                  <Link to="/bookings"><button className="btn-outline" style={{ padding: '6px 16px', fontSize: '0.8rem', gap: 4 }}>View My Bookings <ArrowRight size={13} /></button></Link>
                </div>
                {bookingsLoading ? (
                  <><SkeletonRow /><SkeletonRow /><SkeletonRow /><SkeletonRow /></>
                ) : bookings.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px 0' }}>
                    <p style={{ color: 'var(--text-muted)', marginBottom: 12 }}>No bookings yet</p>
                    <Link to="/stations"><button className="btn-primary" style={{ padding: '8px 20px', fontSize: '0.85rem' }}>Find Your First Station <ArrowRight size={14} /></button></Link>
                  </div>
                ) : (
                  bookings.slice(0, 4).map(b => (
                    <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                      <div>
                        <p style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 2 }}>
                          {b.slot?.station?.name || 'Station'}
                        </p>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                          Slot #{b.slot?.slotNumber} · {new Date(b.startTime).toLocaleDateString()}
                        </p>
                      </div>
                      <span className={`badge-${b.status === 'COMPLETED' ? 'gold' : b.status === 'CANCELLED' ? 'danger' : b.status === 'CONFIRMED' ? 'info' : 'warning'}`}>
                        {b.status}
                      </span>
                    </div>
                  ))
                )}
              </motion.div>
            </div>
          </div>

          {/* Quick actions */}
          <motion.div variants={itemVariants} className="row g-3 mt-2">
            {[
              { to: '/stations', icon: Zap, label: 'Find Stations', desc: 'Browse charging locations' },
              { to: '/auction', icon: Trophy, label: 'Auction Hub', desc: 'Bid on premium slots' },
              { to: '/ai-recommend', icon: Bot, label: 'AI Recommend', desc: 'Smart station finder' },
            ].map((a, i) => (
              <div key={i} className="col-12 col-md-4">
                <Link to={a.to} style={{ textDecoration: 'none' }}>
                  <div
                    className="ev-card"
                    style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer' }}
                  >
                    <a.icon size={32} color="var(--gold)" strokeWidth={1.5} />
                    <div>
                      <p style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 700, letterSpacing: '0.02em', marginBottom: 2 }}>{a.label}</p>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{a.desc}</p>
                    </div>
                  </div>
                </Link>
              </div>
            ))}
          </motion.div>
        </>
      )}

      {/* Station Owner dashboard */}
      {user?.role === 'STATION_OWNER' && (
        <>
          {stationLoading ? (
            <div className="row g-3 mb-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="col-6 col-md-3">
                  <div className="stat-card"><Skeleton height={14} width="60%" style={{ marginBottom: 10 }} /><Skeleton height={26} width="40%" /></div>
                </div>
              ))}
            </div>
          ) : myStation ? (
            <>
              <motion.div variants={itemVariants} className="row g-3 mb-4">
                <div className="col-6 col-md-3">
                  <StatCard label="Total Slots" value={myStation.slots?.length || 0} icon={<Zap size={22} />} />
                </div>
                <div className="col-6 col-md-3">
                  <StatCard
                    label="Available"
                    value={myStation.slots?.filter(s => s.status === 'AVAILABLE').length || 0}
                    icon={<CheckCircle2 size={22} />} color="var(--success)"
                  />
                </div>
                <div className="col-6 col-md-3">
                  <StatCard
                    label="Occupied"
                    value={myStation.slots?.filter(s => s.status === 'OCCUPIED').length || 0}
                    icon={<Plug size={22} />} color="var(--warning)"
                  />
                </div>
                <div className="col-6 col-md-3">
                  <StatCard
                    label="Revenue"
                    value={toPKR(myStation.totalRevenue || 0)}
                    icon={<Wallet size={22} />} color="var(--gold)"
                  />
                </div>
              </motion.div>

              <motion.div variants={itemVariants} className="ev-card" style={{ padding: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div>
                    <h2 style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 700, fontSize: '1.8rem', letterSpacing: '0.02em' }}>{myStation.name}</h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>{myStation.address}, {myStation.city}</p>
                  </div>
                  <span className={`badge-${myStation.status === 'APPROVED' ? 'success' : myStation.status === 'PENDING' ? 'warning' : 'danger'}`}>
                    {myStation.status}
                  </span>
                </div>
                <Link to="/owner/station"><button className="btn-outline-gold" style={{ padding: '8px 20px', fontSize: '0.88rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}>Manage Station <ArrowRight size={14} /></button></Link>
              </motion.div>
            </>
          ) : (
            <motion.div variants={itemVariants} style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}><Zap size={48} color="var(--gold)" strokeWidth={1.5} /></div>
              <h2 style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 700, fontSize: '1.5rem', letterSpacing: '0.02em', marginBottom: 12 }}>No Station Registered Yet</h2>
              <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>Register your charging station to start accepting bookings.</p>
              <Link to="/owner/station"><button className="btn-gold" style={{ padding: '12px 28px' }}>Register Station</button></Link>
            </motion.div>
          )}
        </>
      )}
    </motion.div>
  );
}
