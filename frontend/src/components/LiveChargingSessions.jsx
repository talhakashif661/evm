import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BatteryCharging,
  Clock3,
  Eye,
  Loader2,
  RefreshCw,
  Square,
  UserRound,
  Zap,
} from 'lucide-react';
import { toast } from 'react-toastify';
import PropTypes from 'prop-types';
import api from '../utils/api';
import { getSocket } from '../utils/socket';
import { Modal, SlotStatusBadge } from './Spinner';
import { Skeleton } from './Skeleton';
import { toPKR } from '../utils/pkr';
import './LiveChargingSessions.css';

const POLL_INTERVAL_MS = 15000;

const formatDuration = (startTime, now) => {
  if (!startTime) return '—';
  const seconds = Math.max(Math.floor((now - new Date(startTime).getTime()) / 1000), 0);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};

const liveValues = (session, now) => {
  if (!session.startTime) return { energy: null, bill: null };
  const hours = Math.max(now - new Date(session.startTime).getTime(), 0) / 3600000;
  const energy = Number((hours * session.slot.powerKw).toFixed(2));
  return { energy, bill: Number((energy * session.ratePerKwh).toFixed(2)) };
};

const displayDate = (value) => (value ? new Date(value).toLocaleString() : '—');

export default function LiveChargingSessions({ stationId, onSessionStopped }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [details, setDetails] = useState(null);
  const [stopTarget, setStopTarget] = useState(null);
  const [reason, setReason] = useState('');
  const [stopping, setStopping] = useState(false);

  const fetchSessions = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const response = await api.get('/stations/owner/live-sessions');
      setSessions(response.data.data || []);
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load live charging sessions');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    const poll = setInterval(() => fetchSessions({ quiet: true }), POLL_INTERVAL_MS);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [fetchSessions]);

  useEffect(() => {
    const socket = getSocket();
    const refresh = () => fetchSessions({ quiet: true });
    socket.on('charging-session:updated', refresh);
    socket.on('charging-session:stopped', refresh);
    socket.on('booking:status-changed', refresh);
    socket.on('slot:availability-changed', refresh);
    return () => {
      socket.off('charging-session:updated', refresh);
      socket.off('charging-session:stopped', refresh);
      socket.off('booking:status-changed', refresh);
      socket.off('slot:availability-changed', refresh);
    };
  }, [fetchSessions, stationId]);

  const stopSession = async (event) => {
    event.preventDefault();
    const cleanReason = reason.trim();
    if (cleanReason.length < 3) return;
    setStopping(true);
    try {
      const res = await api.patch(`/bookings/${stopTarget.bookingId}/emergency-stop`, {
        reason: cleanReason,
      });
      const refundAmount = res.data?.data?.refundAmount;
      toast.success(
        refundAmount
          ? `Charging session stopped. ${toPKR(refundAmount)} refunded to the customer for the unused time.`
          : 'Charging session stopped and final totals saved'
      );
      setStopTarget(null);
      setReason('');
      await fetchSessions({ quiet: true });
      onSessionStopped();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not stop charging session');
    } finally {
      setStopping(false);
    }
  };

  const activeCount = useMemo(
    () => sessions.filter((session) => session.sessionStatus === 'ACTIVE').length,
    [sessions]
  );

  return (
    <section className="ev-card live-sessions" aria-labelledby="live-sessions-title">
      <div className="live-sessions__header">
        <div>
          <div className="live-sessions__title-row">
            <BatteryCharging size={22} aria-hidden="true" />
            <h3 id="live-sessions-title">Live Charging Sessions</h3>
            <span className="badge-success">{activeCount} active</span>
          </div>
          <p>Live totals refresh automatically every 15 seconds.</p>
        </div>
        <button
          type="button"
          className="btn-outline live-sessions__refresh"
          onClick={() => fetchSessions()}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="live-sessions__grid" aria-label="Loading live charging sessions">
          {[0, 1].map((item) => (
            <Skeleton key={item} height={300} radius={10} />
          ))}
        </div>
      ) : error ? (
        <div className="live-sessions__state live-sessions__state--error" role="alert">
          <AlertTriangle size={22} />
          <span>{error}</span>
          <button type="button" className="btn-outline" onClick={() => fetchSessions()}>
            Try again
          </button>
        </div>
      ) : sessions.length === 0 ? (
        <div className="live-sessions__state">
          <BatteryCharging size={28} />
          <span>No active or occupied charging slots right now.</span>
        </div>
      ) : (
        <div className="live-sessions__grid">
          {sessions.map((session) => {
            const values = liveValues(session, now);
            return (
              <article className="live-session" key={session.bookingId || session.slot.id}>
                <div className="live-session__top">
                  <div>
                    <span className="live-session__eyebrow">Slot #{session.slot.slotNumber}</span>
                    <strong>{session.slot.powerKw} kW charger</strong>
                  </div>
                  <SlotStatusBadge status={session.chargerStatus} />
                </div>

                <div className="live-session__person">
                  <UserRound size={18} />
                  <div>
                    <strong>{session.customer?.name || 'No active customer'}</strong>
                    <span>
                      {session.vehicle
                        ? `${session.vehicle.model}${session.vehicle.licensePlate ? ` · ${session.vehicle.licensePlate}` : ''}`
                        : 'Slot is occupied without an active booking'}
                    </span>
                  </div>
                </div>

                <div className="live-session__metrics">
                  <div>
                    <span><Clock3 size={13} /> Live duration</span>
                    <strong>{formatDuration(session.startTime, now)}</strong>
                  </div>
                  <div>
                    <span><Zap size={13} /> Energy</span>
                    <strong>{values.energy === null ? '—' : `${values.energy.toFixed(2)} kWh`}</strong>
                  </div>
                  <div>
                    <span>Rate / kWh</span>
                    <strong>{session.ratePerKwh === null ? '—' : toPKR(session.ratePerKwh)}</strong>
                  </div>
                  <div>
                    <span>Current bill</span>
                    <strong className="live-session__bill">
                      {values.bill === null ? '—' : toPKR(values.bill)}
                    </strong>
                  </div>
                </div>

                <div className="live-session__status">
                  <span>
                    Session <b>{session.sessionStatus.replaceAll('_', ' ')}</b>
                  </span>
                  <span>Updated {displayDate(session.lastUpdate)}</span>
                </div>

                <div className="live-session__actions">
                  <button type="button" className="btn-outline" onClick={() => setDetails(session)}>
                    <Eye size={14} /> View Details
                  </button>
                  <button
                    type="button"
                    className="btn-danger-sm"
                    disabled={!session.bookingId || session.sessionStatus !== 'ACTIVE'}
                    onClick={() => {
                      setReason('');
                      setStopTarget(session);
                    }}
                  >
                    <Square size={12} /> Emergency Stop
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Modal show={!!details} onClose={() => setDetails(null)} title="Charging Session Details">
        {details && (
          <dl className="live-session-details">
            <div><dt>Customer</dt><dd>{details.customer?.name || 'Not linked'}</dd></div>
            <div><dt>Email</dt><dd>{details.customer?.email || '—'}</dd></div>
            <div><dt>Phone</dt><dd>{details.customer?.phone || '—'}</dd></div>
            <div><dt>Vehicle</dt><dd>{details.vehicle?.model || '—'}</dd></div>
            <div><dt>License plate</dt><dd>{details.vehicle?.licensePlate || '—'}</dd></div>
            <div><dt>Battery capacity</dt><dd>{details.vehicle ? `${details.vehicle.batteryCapacity} kWh` : '—'}</dd></div>
            <div><dt>Slot / power</dt><dd>#{details.slot.slotNumber} · {details.slot.powerKw} kW</dd></div>
            <div><dt>Started</dt><dd>{displayDate(details.startTime)}</dd></div>
            <div><dt>Charger status</dt><dd>{details.chargerStatus}</dd></div>
            <div><dt>Session status</dt><dd>{details.sessionStatus.replaceAll('_', ' ')}</dd></div>
            <div><dt>Last update</dt><dd>{displayDate(details.lastUpdate)}</dd></div>
          </dl>
        )}
      </Modal>

      <Modal
        show={!!stopTarget}
        onClose={() => {
          if (!stopping) setStopTarget(null);
        }}
        title="Confirm Emergency Stop"
      >
        <form onSubmit={stopSession}>
          <div className="live-session-stop-warning">
            <AlertTriangle size={20} />
            <p>
              This immediately ends charging on Slot #{stopTarget?.slot.slotNumber} and saves the
              final energy, duration, and bill.
            </p>
          </div>
          <label className="form-label" htmlFor="emergency-stop-reason">
            Reason <span aria-hidden="true">*</span>
          </label>
          <textarea
            id="emergency-stop-reason"
            className="form-control"
            rows="4"
            minLength="3"
            maxLength="500"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Describe why charging must be stopped"
            required
            autoFocus
          />
          <div className="live-session-stop-actions">
            <button type="button" className="btn-outline" onClick={() => setStopTarget(null)} disabled={stopping}>
              Cancel
            </button>
            <button type="submit" className="btn-danger-sm" disabled={stopping || reason.trim().length < 3}>
              {stopping ? <Loader2 size={14} className="spin" /> : <Square size={12} />}
              {stopping ? 'Stopping…' : 'Stop Charging'}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}

LiveChargingSessions.propTypes = {
  stationId: PropTypes.string.isRequired,
  onSessionStopped: PropTypes.func.isRequired,
};
