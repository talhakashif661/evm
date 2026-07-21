import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { Car, BatteryCharging, Pencil, Trash2, Plus, Zap } from 'lucide-react';
import { fetchMyEVs, addEV, updateEV, deleteEV, updateBattery } from '../store/slices/evSlice';
import { BatteryBar, Modal, EmptyState } from '../components/Spinner';
import { SkeletonCard } from '../components/Skeleton';
import SEO from '../components/SEO';

const EVForm = ({ form, setForm, onSubmit, btnLabel }) => (
  <form onSubmit={onSubmit}>
    <div className="mb-3">
      <label className="form-label" htmlFor="ev-model">
        EV Model
      </label>
      <input
        id="ev-model"
        className="form-control"
        placeholder="Tesla Model 3"
        value={form.model}
        onChange={(e) => setForm({ ...form, model: e.target.value })}
        required
      />
    </div>
    <div className="row g-3 mb-3">
      <div className="col-12 col-sm-6">
        <label className="form-label" htmlFor="ev-capacity">
          Battery Capacity (kWh)
        </label>
        <input
          id="ev-capacity"
          type="number"
          className="form-control"
          placeholder="82"
          value={form.batteryCapacity}
          onChange={(e) => setForm({ ...form, batteryCapacity: e.target.value })}
          required
          min="1"
        />
      </div>
      <div className="col-12 col-sm-6">
        <label className="form-label" htmlFor="ev-level">
          Current Level (%)
        </label>
        <input
          id="ev-level"
          type="number"
          className="form-control"
          placeholder="80"
          value={form.batteryPercentage}
          onChange={(e) => setForm({ ...form, batteryPercentage: e.target.value })}
          min="0"
          max="100"
        />
      </div>
    </div>
    <div className="mb-4">
      <label className="form-label" htmlFor="ev-plate">
        License Plate (optional)
      </label>
      <input
        id="ev-plate"
        className="form-control"
        placeholder="NY-EV-001"
        value={form.licensePlate}
        onChange={(e) => setForm({ ...form, licensePlate: e.target.value })}
      />
    </div>
    <button type="submit" className="btn-gold" style={{ width: '100%', padding: 12 }}>
      {btnLabel}
    </button>
  </form>
);

export default function MyEVs() {
  const dispatch = useDispatch();
  const { evs, loading, error } = useSelector((s) => s.ev);
  const [showAdd, setShowAdd] = useState(false);
  const [editEV, setEditEV] = useState(null);
  const [batteryModal, setBatteryModal] = useState(null);
  const [form, setForm] = useState({
    model: '',
    batteryCapacity: '',
    batteryPercentage: '100',
    licensePlate: '',
  });
  const [batteryVal, setBatteryVal] = useState(50);

  useEffect(() => {
    dispatch(fetchMyEVs());
  }, [dispatch]);

  const handleAdd = async (e) => {
    e.preventDefault();
    const res = await dispatch(addEV(form));
    if (!res.error) {
      setShowAdd(false);
      setForm({ model: '', batteryCapacity: '', batteryPercentage: '100', licensePlate: '' });
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    const res = await dispatch(updateEV({ id: editEV.id, data: form }));
    if (!res.error) setEditEV(null);
  };

  const openEdit = (ev) => {
    setEditEV(ev);
    setForm({
      model: ev.model,
      batteryCapacity: ev.batteryCapacity,
      batteryPercentage: ev.batteryPercentage,
      licensePlate: ev.licensePlate || '',
    });
  };

  const handleUpdateBattery = async () => {
    await dispatch(updateBattery({ id: batteryModal.id, batteryPercentage: batteryVal }));
    setBatteryModal(null);
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '44px 32px' }}>
      <SEO
        title="My Electric Vehicles"
        description="Add and manage your electric vehicles, track battery levels, and keep your EV details up to date."
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
            My <span>EVs</span>
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Manage your electric vehicles
          </p>
        </div>
        <button
          className="btn-gold"
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          onClick={() => setShowAdd(true)}
        >
          <Plus size={16} /> Add EV
        </button>
      </div>

      {loading ? (
        <div className="row g-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="col-12 col-md-6">
              <SkeletonCard />
            </div>
          ))}
        </div>
      ) : error && evs.length === 0 ? (
        <EmptyState
          icon={<Zap size={48} color="var(--error)" strokeWidth={1.5} />}
          title="Couldn't load your EVs"
          subtitle="Something went wrong on our end — try again in a moment."
          action={
            <button className="btn-primary" onClick={() => dispatch(fetchMyEVs())}>
              Try Again
            </button>
          }
        />
      ) : evs.length === 0 ? (
        <EmptyState
          icon={<Car size={48} color="var(--text-muted)" strokeWidth={1.5} />}
          title="No EVs yet"
          subtitle="Add your first electric vehicle to get started."
          action={
            <button className="btn-gold" onClick={() => setShowAdd(true)}>
              Add Your EV
            </button>
          }
        />
      ) : (
        <div className="row g-4">
          {evs.map((ev, i) => (
            <div key={ev.id} className="col-12 col-md-6">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className="ev-card"
                style={{ padding: 24 }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: 16,
                  }}
                >
                  <div>
                    <h2
                      style={{
                        fontFamily: 'Georgia, "Times New Roman", serif',
                        fontWeight: 700,
                        fontSize: '1.5rem',
                        letterSpacing: '0.02em',
                        marginBottom: 6,
                      }}
                    >
                      {ev.model}
                    </h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                      {ev.licensePlate || 'No license plate'}
                    </p>
                  </div>
                  <Car size={30} color="var(--gold)" strokeWidth={1.5} />
                </div>

                <div style={{ marginBottom: 16 }}>
                  <BatteryBar percentage={ev.batteryPercentage} />
                </div>

                <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
                  <div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: 2 }}>
                      CAPACITY
                    </p>
                    <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>{ev.batteryCapacity} kWh</p>
                  </div>
                  <div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: 2 }}>
                      CHARGE LEFT
                    </p>
                    <p
                      style={{
                        fontWeight: 600,
                        fontSize: '0.95rem',
                        color: ev.batteryPercentage <= 20 ? 'var(--danger)' : 'var(--text-primary)',
                      }}
                    >
                      {((ev.batteryCapacity * ev.batteryPercentage) / 100).toFixed(1)} kWh
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn-outline-gold"
                    style={{
                      flex: 1,
                      padding: '8px',
                      fontSize: '0.82rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                    onClick={() => {
                      setBatteryModal(ev);
                      setBatteryVal(ev.batteryPercentage);
                    }}
                  >
                    <BatteryCharging size={15} /> Update Battery
                  </button>
                  <button
                    onClick={() => openEdit(ev)}
                    style={{
                      padding: '8px 12px',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    aria-label="Edit EV"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => dispatch(deleteEV(ev.id))}
                    style={{
                      padding: '8px 12px',
                      background: '#F3E1DE',
                      border: '1px solid #E0BAB4',
                      borderRadius: 4,
                      color: 'var(--danger)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    aria-label="Delete EV"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </motion.div>
            </div>
          ))}
        </div>
      )}

      {/* Add Modal */}
      <Modal show={showAdd} onClose={() => setShowAdd(false)} title="Add New EV">
        <EVForm
          form={form}
          setForm={setForm}
          onSubmit={handleAdd}
          btnLabel={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              Add EV <Zap size={15} />
            </span>
          }
        />
      </Modal>

      {/* Edit Modal */}
      <Modal show={!!editEV} onClose={() => setEditEV(null)} title="Edit EV">
        <EVForm form={form} setForm={setForm} onSubmit={handleEdit} btnLabel="Save Changes" />
      </Modal>

      {/* Battery update modal */}
      <Modal
        show={!!batteryModal}
        onClose={() => setBatteryModal(null)}
        title="Update Battery Level"
      >
        <div>
          <p style={{ color: 'var(--text-muted)', marginBottom: 16, fontSize: '0.9rem' }}>
            Set current battery percentage for{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{batteryModal?.model}</strong>
          </p>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <span
              style={{
                fontFamily: 'Inter',
                fontSize: '3rem',
                fontWeight: 700,
                color:
                  batteryVal <= 20
                    ? 'var(--danger)'
                    : batteryVal <= 50
                      ? 'var(--warning)'
                      : 'var(--success)',
              }}
            >
              {batteryVal}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={batteryVal}
            onChange={(e) => setBatteryVal(parseInt(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--gold)', marginBottom: 24 }}
          />
          <BatteryBar percentage={batteryVal} />
          <button
            className="btn-gold"
            style={{ width: '100%', padding: 12, marginTop: 20 }}
            onClick={handleUpdateBattery}
          >
            Update Battery Level
          </button>
        </div>
      </Modal>
    </div>
  );
}
