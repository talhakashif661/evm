import { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, CartesianGrid } from 'recharts';
import api from '../utils/api';
import { toPKR } from '../utils/pkr';
import { logger } from '../utils/logger';
import { Skeleton, SkeletonRow } from '../components/Skeleton';
import SEO from '../components/SEO';

const PERIODS = ['daily','weekly','monthly','yearly'];

export default function StationReport() {
  const [bookings, setBookings]   = useState([]);
  const [period, setPeriod]       = useState('monthly');
  const [loading, setLoading]     = useState(true);
  const [tablePage, setTablePage] = useState(1);
  const ROWS_PER_PAGE = 15;
  const [stats, setStats]       = useState({ total:0, completed:0, cancelled:0, totalRevenue:0, totalEnergy:0 });

  useEffect(() => { fetchData(); }, []);
  // New data (initial load, or a future period-driven refetch) should show
  // page 1 of the new result set, not whatever page was previously selected.
  useEffect(() => { setTablePage(1); }, [bookings]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const bRes = await api.get('/stations/owner/bookings?limit=200');
      const bData = bRes.data.data || [];
      setBookings(bData);

      const completed  = bData.filter(b => b.status === 'COMPLETED');
      const cancelled  = bData.filter(b => b.status === 'CANCELLED');
      // Revenue only counts sessions the user actually paid for.
      const paid       = completed.filter(b => b.payment);
      const totalRev   = paid.reduce((a,b) => a + (b.totalCost||0), 0);
      const totalEnergy= completed.reduce((a,b) => {
        const hrs = b.endTime ? (new Date(b.endTime)-new Date(b.startTime))/3600000 : 0;
        return a + hrs * (b.slot?.powerKw||0);
      }, 0);
      setStats({ total:bData.length, completed:completed.length, cancelled:cancelled.length, totalRevenue:totalRev, totalEnergy });
    } catch(e){ logger.error(e); }
    finally { setLoading(false); }
  };

  const buildChartData = () => {
    const completed = bookings.filter(b => b.status==='COMPLETED' && b.payment && b.createdAt);
    const buckets   = {};

    completed.forEach(b => {
      const d = new Date(b.createdAt);
      let key = '';
      if (period==='daily')   key = d.toLocaleDateString('en-PK',{day:'2-digit',month:'short'});
      if (period==='weekly')  { const w = getWeek(d); key = `W${w} ${d.getFullYear()}`; }
      if (period==='monthly') key = d.toLocaleDateString('en-PK',{month:'short',year:'numeric'});
      if (period==='yearly')  key = String(d.getFullYear());
      buckets[key] = (buckets[key]||0) + (b.totalCost||0);
    });

    return Object.entries(buckets)
      .map(([name,revenue]) => ({ name, revenue: parseFloat(revenue.toFixed(2)), revenueDisplay: toPKR(revenue) }))
      .slice(-20);
  };

  const getWeek = (d) => {
    const start = new Date(d.getFullYear(), 0, 1);
    return Math.ceil(((d-start)/86400000 + start.getDay()+1)/7);
  };

  const chartData = buildChartData();

  // The table shows a bounded page of rows; `bookings` itself stays the full
  // fetched set (up to 200) since the stats/chart above need the complete
  // picture, not just whatever page is currently visible in the table.
  const totalTablePages = Math.ceil(bookings.length / ROWS_PER_PAGE);
  const pagedBookings = useMemo(
    () => bookings.slice((tablePage - 1) * ROWS_PER_PAGE, tablePage * ROWS_PER_PAGE),
    [bookings, tablePage]
  );

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active||!payload?.length) return null;
    return (
      <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 14px' }}>
        <p style={{ color:'var(--text-muted)', fontSize:'0.75rem', marginBottom:4 }}>{label}</p>
        <p style={{ color:'var(--primary)', fontWeight:700, fontFamily:'Inter', fontSize:'1.1rem' }}>
          {toPKR(payload[0].value)}
        </p>
      </div>
    );
  };

  if (loading) return (
    <div className="page-container">
      <Skeleton height={40} width="45%" style={{ marginBottom: 6 }} />
      <Skeleton height={16} width="60%" style={{ marginBottom: 28 }} />
      <div className="ev-card" style={{ padding: 24, marginBottom: 24 }}>
        <Skeleton height={18} width="30%" style={{ marginBottom: 20 }} />
        <Skeleton height={220} radius={8} />
      </div>
      <div className="ev-card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px' }}>
          <Skeleton height={18} width="35%" />
        </div>
        <div style={{ padding: '0 20px' }}>
          {[...Array(4)].map((_, i) => <SkeletonRow key={i} />)}
        </div>
      </div>
    </div>
  );

  return (
    <div className="page-container">
      <SEO
        title="Station Reports"
        description="View revenue, bookings, and usage analytics for your EV charging station, broken down by day, week, month, or year."
        noIndex
      />
      <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }}>
        <div style={{ marginBottom:28 }}>
          <h1 style={{ fontFamily:'Georgia, "Times New Roman", serif', fontSize:'2.6rem', fontWeight:700, letterSpacing:'0.02em', marginBottom:6 }}>
            Charging <span style={{ color:'var(--primary)' }}>Report</span>
          </h1>
          <p style={{ color:'var(--text-secondary)', fontSize:'0.9rem' }}>User charging activity at your station</p>
        </div>

        {/* Summary Stats */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:16, marginBottom:32 }}>
          {[
            { label:'Total Sessions', value:stats.total, color:'var(--primary)' },
            { label:'Completed',      value:stats.completed, color:'var(--success)' },
            { label:'Cancelled',      value:stats.cancelled, color:'var(--danger)' },
            { label:'Energy Delivered', value:`${stats.totalEnergy.toFixed(1)} kWh`, color:'var(--accent)' },
            { label:'Total Revenue',  value:toPKR(stats.totalRevenue), color:'var(--warning)' },
          ].map(s => (
            <div key={s.label} className="stat-card" style={{ textAlign:'center', padding:20 }}>
              <p style={{ fontSize:'1.7rem', fontWeight:700, fontFamily:'Inter', color:s.color }}>{s.value}</p>
              <p style={{ color:'var(--text-muted)', fontSize:'0.72rem', textTransform:'uppercase', letterSpacing:'0.06em', marginTop:4 }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Period Selector */}
        <div style={{ display:'flex', gap:4, marginBottom:24 }}>
          {PERIODS.map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{
              padding:'8px 18px', borderRadius:4, cursor:'pointer', fontFamily:'Inter', fontWeight:600,
              textTransform:'capitalize', fontSize:'0.88rem',
              background: period===p ? 'var(--primary-glow)' : 'var(--bg-elevated)',
              border:`1px solid ${period===p ? 'var(--primary)' : 'var(--border)'}`,
              color: period===p ? 'var(--primary)' : 'var(--text-secondary)',
              transition:'background-color 0.12s ease, border-color 0.12s ease'
            }}>{p}</button>
          ))}
        </div>

        {/* Revenue Chart */}
        <div className="ev-card" style={{ padding:24, marginBottom:24 }}>
          <h2 style={{ fontFamily:'Inter', fontSize:'1.1rem', fontWeight:700, marginBottom:20, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.06em' }}>
            Revenue — {period}
          </h2>
          {chartData.length === 0 ? (
            <p style={{ color:'var(--text-muted)', textAlign:'center', padding:40 }}>No completed sessions yet for this period.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5DFD2" />
                <XAxis dataKey="name" tick={{ fill:'#5C5648', fontSize:11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill:'#5C5648', fontSize:11 }} axisLine={false} tickLine={false}
                  tickFormatter={v => `Rs.${(v/1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="revenue" stroke="#C9A96E" strokeWidth={2}
                  fill="#C9A96E" fillOpacity={0.16} dot={{ fill:'#C9A96E', r:3 }} activeDot={{ r:5 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Sessions Table */}
        <div className="ev-card" style={{ overflow:'hidden' }}>
          <div style={{ padding:'18px 20px', borderBottom:'1px solid var(--border)' }}>
            <h2 style={{ fontFamily:'Inter', fontSize:'1.1rem', fontWeight:700, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.06em' }}>
              Recent Charging Sessions
            </h2>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table className="ev-table">
              <thead>
                <tr>
                  <th>User</th><th>EV Model</th><th>Slot</th>
                  <th>Date</th><th>Duration</th><th>Energy</th><th>Cost (PKR)</th><th>Payment</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {bookings.length===0 ? (
                  <tr><td colSpan={9} style={{ textAlign:'center', color:'var(--text-muted)', padding:32 }}>No sessions yet</td></tr>
                ) : pagedBookings.map(b => {
                  const hrs = b.endTime ? (new Date(b.endTime)-new Date(b.startTime))/3600000 : 0;
                  const energy = hrs * (b.slot?.powerKw||0);
                  const map = { COMPLETED:'badge-success', CONFIRMED:'badge-primary', ACTIVE:'badge-warning', CANCELLED:'badge-danger', PENDING:'badge-info' };
                  return (
                    <tr key={b.id}>
                      <td>
                        <p style={{ fontWeight:500, fontSize:'0.88rem' }}>{b.user?.name}</p>
                        <p style={{ color:'var(--text-muted)', fontSize:'0.74rem' }}>{b.user?.email}</p>
                      </td>
                      <td style={{ fontSize:'0.85rem', color:'var(--text-secondary)' }}>{b.ev?.model||'—'}</td>
                      <td style={{ color:'var(--primary)', fontWeight:600 }}>#{b.slot?.slotNumber}</td>
                      <td style={{ color:'var(--text-secondary)', fontSize:'0.82rem' }}>
                        {new Date(b.createdAt).toLocaleDateString('en-PK')}
                      </td>
                      <td style={{ color:'var(--text-secondary)', fontSize:'0.85rem' }}>
                        {hrs>0 ? `${Math.round(hrs*60)} min` : '—'}
                      </td>
                      <td style={{ color:'var(--accent)', fontWeight:600 }}>
                        {energy>0 ? `${energy.toFixed(2)} kWh` : '—'}
                      </td>
                      <td style={{ color:'var(--warning)', fontWeight:700, fontFamily:'Inter' }}>
                        {b.totalCost ? toPKR(b.totalCost) : '—'}
                      </td>
                      <td>
                        {b.status === 'COMPLETED'
                          ? (b.payment ? <span className="badge-success">Paid</span> : <span className="badge-danger">Unpaid</span>)
                          : '—'}
                      </td>
                      <td><span className={map[b.status]||'badge-info'}>{b.status}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {totalTablePages > 1 && (
              <div style={{ display:'flex', justifyContent:'center', gap:8, padding:'16px 24px', borderTop:'1px solid var(--border)' }}>
                {Array.from({length:totalTablePages},(_,i)=>i+1).map(p => (
                  <button key={p} onClick={() => setTablePage(p)} style={{
                    width:36, height:36, borderRadius:4,
                    background: p===tablePage ? 'var(--primary)' : 'var(--bg-elevated)',
                    border:`1px solid ${p===tablePage ? 'var(--primary)' : 'var(--border)'}`,
                    color: p===tablePage ? '#ffffff' : 'var(--text-secondary)',
                    cursor:'pointer', fontWeight:700, fontSize:'0.82rem'
                  }}>{p}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
