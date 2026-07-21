import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Star, CheckCircle2, ThumbsUp, ArrowDown, Bot, MapPin, Lightbulb, ArrowRight } from 'lucide-react';
import { fetchRecommendations } from '../store/slices/aiSlice';
import { EmptyState } from '../components/Spinner';
import { Link } from 'react-router-dom';
import { toPKR } from '../utils/pkr';
import SEO from '../components/SEO';

const ScoreBar = ({ label, value, max = 100 }) => (
  <div style={{ marginBottom: 8 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: '0.75rem', color: 'var(--gold)', fontWeight: 600 }}>{value.toFixed(0)}</span>
    </div>
    <div style={{ height: 4, background: 'var(--bg-elevated)', borderRadius: 2 }}>
      <motion.div initial={{ width: 0 }} animate={{ width: `${(value / max) * 100}%` }} transition={{ duration: 0.8 }}
        style={{ height: '100%', background: 'var(--gold)', borderRadius: 2 }} />
    </div>
  </div>
);

const labelColors = {
  EMERGENCY_PRIORITY: { bg: '#F3E1DE', color: 'var(--danger)', border: '#E0BAB4', icon: AlertTriangle, text: 'EMERGENCY' },
  HIGHLY_RECOMMENDED: { bg: '#E4E9EE', color: 'var(--primary-dark)', border: '#C3CDD8', icon: Star, text: 'TOP PICK' },
  RECOMMENDED: { bg: '#E3EDE5', color: '#2E5B39', border: '#BFD6C5', icon: CheckCircle2, text: 'RECOMMENDED' },
  FAIR: { bg: '#DEE6EC', color: 'var(--info)', border: '#B9C7D3', icon: ThumbsUp, text: 'FAIR' },
  NOT_RECOMMENDED: { bg: 'var(--bg-elevated)', color: 'var(--text-muted)', border: 'var(--border)', icon: ArrowDown, text: 'LOW SCORE' },
};

export default function AIRecommend() {
  const dispatch = useDispatch();
  const { recommendations, meta, loading, error } = useSelector(s => s.ai);
  const { evs } = useSelector(s => s.ev);
  const [form, setForm] = useState({ latitude: '', longitude: '', batteryLevel: '', limit: 5 });
  const [selectedEV, setSelectedEV] = useState('');

  const handleEVSelect = (evId) => {
    setSelectedEV(evId);
    const ev = evs.find(e => e.id === evId);
    if (ev) setForm(f => ({ ...f, batteryLevel: ev.batteryPercentage }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    dispatch(fetchRecommendations({ latitude: form.latitude, longitude: form.longitude, batteryLevel: form.batteryLevel, limit: form.limit }));
  };

  const useCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setForm(f => ({ ...f, latitude: pos.coords.latitude.toFixed(4), longitude: pos.coords.longitude.toFixed(4) })),
        () => { setForm(f => ({ ...f, latitude: '40.7128', longitude: '-74.0060' })); }
      );
    }
  };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '44px 32px' }}>
      <SEO
        title="AI Station Recommendations"
        description="Get intelligent EV charging station suggestions based on your distance, price preferences, and charging urgency."
        noIndex
      />
      <div style={{ marginBottom: 32 }}>
        <h1 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Bot size={28} /> AI <span>Recommendations</span>
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Intelligent station selection based on distance, price, availability & urgency</p>
      </div>

      {/* Input form */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="ev-card" style={{ padding: 28, marginBottom: 32 }}>
        <h2 style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 700, marginBottom: 20, fontSize: '1.5rem', letterSpacing: '0.02em' }}>Your Parameters</h2>
        <form onSubmit={handleSubmit}>
          <div className="row g-3">
            {evs.length > 0 && (
              <div className="col-12 col-md-4">
                <label className="form-label" htmlFor="ai-quickfill">Quick Fill from EV</label>
                <select id="ai-quickfill" className="form-select" value={selectedEV} onChange={e => handleEVSelect(e.target.value)}>
                  <option value="">-- Select EV --</option>
                  {evs.map(ev => <option key={ev.id} value={ev.id}>{ev.model} ({ev.batteryPercentage}%)</option>)}
                </select>
              </div>
            )}
            <div className="col-6 col-md-3">
              <label className="form-label" htmlFor="ai-lat">Latitude</label>
              <input id="ai-lat" className="form-control" placeholder="40.7128" value={form.latitude} onChange={e => setForm({ ...form, latitude: e.target.value })} required />
            </div>
            <div className="col-6 col-md-3">
              <label className="form-label" htmlFor="ai-lng">Longitude</label>
              <input id="ai-lng" className="form-control" placeholder="-74.0060" value={form.longitude} onChange={e => setForm({ ...form, longitude: e.target.value })} required />
            </div>
            <div className="col-6 col-md-3">
              <label className="form-label" htmlFor="ai-battery">Battery Level (%)</label>
              <input id="ai-battery" type="number" className="form-control" placeholder="45" min="1" max="100"
                value={form.batteryLevel} onChange={e => setForm({ ...form, batteryLevel: e.target.value })} required />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
            <button type="button" className="btn-outline-gold" style={{ padding: '10px 20px', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 6 }} onClick={useCurrentLocation}>
              <MapPin size={15} /> Use My Location
            </button>
            <button type="submit" className="btn-gold" style={{ padding: '10px 28px', display: 'flex', alignItems: 'center', gap: 8 }} disabled={loading}>
              <Bot size={16} /> {loading ? 'Analyzing...' : 'Get AI Recommendations'}
            </button>
          </div>
        </form>
      </motion.div>

      {/* Emergency warning */}
      {meta?.isEmergency && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{ padding: 16, background: '#F3E1DE', border: '1px solid #E0BAB4', borderRadius: 6, marginBottom: 24 }}>
          <p style={{ color: 'var(--danger)', fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={16} /> CRITICAL BATTERY LEVEL DETECTED
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>Emergency priority mode active. Nearest available stations are ranked highest.</p>
        </motion.div>
      )}

      {!loading && error && recommendations.length === 0 && (
        <EmptyState
          icon={<Bot size={48} color="var(--error)" strokeWidth={1.5} />}
          title="Couldn't get recommendations"
          subtitle="Something went wrong on our end — try again in a moment."
          action={<button className="btn-primary" onClick={() => dispatch(fetchRecommendations({ latitude: form.latitude, longitude: form.longitude, batteryLevel: form.batteryLevel, limit: form.limit }))}>Try Again</button>}
        />
      )}

      {/* Results */}
      <AnimatePresence>
        {recommendations.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '1.8rem', fontWeight: 700, letterSpacing: '0.02em' }}>
                AI Results <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 400 }}>
                  ({meta?.totalStationsAnalyzed} stations analyzed)
                </span>
              </h2>
            </div>

            {recommendations.map((station, i) => {
              const badge = labelColors[station.recommendation] || labelColors.FAIR;
              return (
                <motion.div key={station.id}
                  initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}
                  className="ev-card"
                  style={{ padding: 24, marginBottom: 16, borderLeft: i === 0 ? '3px solid var(--gold)' : '1px solid var(--border)' }}
                >
                  <div className="row g-3 align-items-center">
                    <div className="col-12 col-md-5">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                        <span style={{ fontFamily: 'Inter', fontSize: '1.8rem', fontWeight: 700, color: 'var(--gold)', minWidth: 32 }}>#{i + 1}</span>
                        <div>
                          <h3 style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 700, fontSize: '1.4rem', letterSpacing: '0.02em', marginBottom: 2 }}>{station.name}</h3>
                          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={12} /> {station.address}, {station.city}</p>
                        </div>
                      </div>
                      <span style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, padding: '4px 10px', borderRadius: 4, fontSize: '0.72rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <badge.icon size={12} /> {badge.text}
                      </span>
                      {i === 0 && station.aiExplanation && (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: 8, fontStyle: 'italic', display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                          <Lightbulb size={13} style={{ flexShrink: 0, marginTop: 1 }} /> {station.aiExplanation}
                        </p>
                      )}
                    </div>

                    <div className="col-12 col-md-4">
                      <ScoreBar label="Overall AI Score" value={station.aiMetrics.score} />
                      <ScoreBar label="Distance Score" value={station.aiMetrics.distanceScore} />
                      <ScoreBar label="Price Score" value={station.aiMetrics.priceScore} />
                      <ScoreBar label="Availability" value={station.aiMetrics.availabilityScore} />
                    </div>

                    <div className="col-12 col-md-3">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Distance</span>
                          <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{station.aiMetrics.distance} km</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Available</span>
                          <span style={{ fontWeight: 600, fontSize: '0.85rem', color: station.aiMetrics.availableSlots > 0 ? 'var(--success)' : 'var(--danger)' }}>
                            {station.aiMetrics.availableSlots} slots
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }} title="Estimated from current queue length — shown for reference, not used in the AI score above">
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Est. Wait</span>
                          <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>~{station.aiMetrics.estimatedWaitMinutes} min</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Price</span>
                          <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--gold)' }}>{toPKR(station.pricePerKwh)}/kWh</span>
                        </div>
                      </div>
                      <Link to={`/stations/${station.id}`} style={{ textDecoration: 'none' }}>
                        <button className="btn-outline-gold" style={{ width: '100%', padding: '8px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          View & Book <ArrowRight size={14} />
                        </button>
                      </Link>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
