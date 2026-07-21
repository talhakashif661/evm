import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Users, Zap, ClipboardList, Wallet, Hourglass } from 'lucide-react';
import { fetchDashboard as fetchDashboardStats } from '../../store/slices/adminDashboardSlice';
import { toPKR } from '../../utils/pkr';
import { Skeleton, SkeletonRow } from '../../components/Skeleton';
import SEO from '../../components/SEO';

export default function AdminDashboard() {
  const dispatch = useDispatch();
  const { stats, chartData, recentBookings, loading } = useSelector(s => s.adminDashboard);

  useEffect(() => { dispatch(fetchDashboardStats()); }, [dispatch]);

  const cards = [
    { label:'Total Users',    value: stats?.totalUsers    || 0, color:'var(--primary)', icon:Users },
    { label:'Stations',       value: stats?.totalStations || 0, color:'var(--accent)',   icon:Zap },
    { label:'Bookings',       value: stats?.totalBookings || 0, color:'var(--success)',  icon:ClipboardList },
    { label:'Total Revenue',  value: toPKR(stats?.totalRevenue||0), color:'var(--warning)', icon:Wallet },
    { label:'Pending Stations', value: stats?.pendingStations||0, color:'var(--danger)', icon:Hourglass },
  ];

  if (loading) return (
    <div className="page-container">
      <Skeleton height={40} width="45%" style={{ marginBottom: 28 }} />
      <div className="row g-4" style={{ marginBottom: 24 }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="col-6 col-lg-3">
            <div className="ev-card" style={{ padding: 20 }}>
              <Skeleton height={13} width="60%" style={{ marginBottom: 10 }} />
              <Skeleton height={26} width="40%" />
            </div>
          </div>
        ))}
      </div>
      <div className="row g-4">
        <div className="col-12 col-lg-7">
          <div className="ev-card" style={{ padding: 24, height: '100%' }}>
            <Skeleton height={220} radius={8} />
          </div>
        </div>
        <div className="col-12 col-lg-5">
          <div className="ev-card" style={{ padding: 24, height: '100%' }}>
            {[...Array(4)].map((_, i) => <SkeletonRow key={i} />)}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="page-container">
      <SEO
        title="Admin Dashboard"
        description="Manage stations, users, and monitor EV charging activity across the ChargeEV platform."
        noIndex
      />
      <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }}>
        <div style={{ marginBottom:28 }}>
          <h1 style={{ fontFamily:'Georgia, "Times New Roman", serif', fontSize:'2.6rem', fontWeight:700, letterSpacing:'0.02em' }}>
            Admin <span style={{ color:'var(--primary)' }}>Dashboard</span>
          </h1>
          <p style={{ color:'var(--text-secondary)', fontSize:'0.9rem' }}>Platform overview</p>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:16, marginBottom:32 }}>
          {cards.map((c,i) => (
            <motion.div key={c.label} className="stat-card" initial={{ opacity:0,y:20 }} animate={{ opacity:1,y:0,transition:{delay:i*0.07} }}>
              <p style={{ marginBottom:8 }}><c.icon size={30} color={c.color} strokeWidth={1.5} /></p>
              <p style={{ fontSize:'1.9rem', fontWeight:700, fontFamily:'Inter', color:c.color }}>{c.value}</p>
              <p style={{ color:'var(--text-muted)', fontSize:'0.75rem', textTransform:'uppercase', letterSpacing:'0.06em', marginTop:4 }}>{c.label}</p>
            </motion.div>
          ))}
        </div>

        <div className="row g-4">
          <div className="col-12 col-lg-7">
            <div className="ev-card" style={{ padding: 24, height: '100%' }}>
              <h2 style={{ fontFamily:'Inter', fontSize:'1.1rem', fontWeight:700, marginBottom:20, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.06em' }}>
                Bookings — Last 6 Months
              </h2>
              {chartData && chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} />
                    <YAxis stroke="var(--text-muted)" fontSize={12} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }} />
                    <Bar dataKey="bookings" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>No booking data yet.</p>
              )}
            </div>
          </div>

          <div className="col-12 col-lg-5">
            <div className="ev-card" style={{ padding: 24, height: '100%' }}>
              <h2 style={{ fontFamily:'Inter', fontSize:'1.1rem', fontWeight:700, marginBottom:20, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.06em' }}>
                Recent Bookings
              </h2>
              {recentBookings && recentBookings.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {recentBookings.map(b => (
                    <div key={b.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                      <p style={{ fontWeight: 600, fontSize: '0.88rem' }}>{b.user?.name || 'Unknown user'}</p>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                        {b.slot?.station?.name || 'Station'} · {new Date(b.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>No recent bookings.</p>
              )}
            </div>
          </div>
        </div>

        <div className="ev-card" style={{ padding:24, marginTop: 24 }}>
          <h2 style={{ fontFamily:'Inter', fontSize:'1.1rem', fontWeight:700, marginBottom:16, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.06em' }}>
            Quick Actions
          </h2>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:12 }}>
            {[
              { label:'Manage Users',    path:'/admin/users' },
              { label:'Approve Stations', path:'/admin/stations' },
              { label:'View Bookings',   path:'/admin/bookings' },
            ].map(a => (
              <Link key={a.label} to={a.path} style={{
                display:'block', padding:'14px 18px', background:'var(--bg-elevated)',
                border:'1px solid var(--border)', borderRadius:4, color:'var(--primary)',
                textDecoration:'none', fontFamily:'Inter', fontWeight:700, fontSize:'0.95rem',
                transition:'border-color 0.12s ease', textAlign:'center'
              }}
              onMouseEnter={e=>e.target.style.borderColor='var(--primary)'}
              onMouseLeave={e=>e.target.style.borderColor='var(--border)'}
              >{a.label}</Link>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
