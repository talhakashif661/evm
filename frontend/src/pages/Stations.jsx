import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Zap, Trophy, MapPin, ArrowRight, List, Map as MapIcon } from 'lucide-react';
import { fetchStations } from '../store/slices/stationSlice';
import { EmptyState } from '../components/Spinner';
import { SkeletonCard } from '../components/Skeleton';
import StationsMap from '../components/StationsMap';
import { toPKR } from '../utils/pkr';
import { Stars } from '../components/Stars';
import SEO from '../components/SEO';
import Pagination from '../components/Pagination.jsx';

const emptyFilters = { city: '', name: '', maxPrice: '', minRating: '' };

export default function Stations() {
  const dispatch = useDispatch();
  const { stations, loading, error, pagination } = useSelector((s) => s.stations);
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [view, setView] = useState('list'); // 'list' | 'map'

  const activeParams = () => {
    const p = { page, limit: 12 };
    if (filters.city) p.city = filters.city;
    if (filters.name) p.name = filters.name;
    if (filters.maxPrice) p.maxPrice = filters.maxPrice;
    if (filters.minRating) p.minRating = filters.minRating;
    return p;
  };

  useEffect(() => {
    dispatch(fetchStations(activeParams()));
    // Deliberately scoped to `page` only — `filters` changes are applied
    // via the explicit handleSearch/handleClear actions below, not
    // automatically on every keystroke (which adding activeParams/filters
    // here would cause, since activeParams() also reads filters state).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, page]);

  const hasActiveFilters = Object.values(filters).some(Boolean);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    dispatch(fetchStations({ ...activeParams(), page: 1 }));
  };

  const handleClear = () => {
    setFilters(emptyFilters);
    setPage(1);
    dispatch(fetchStations({ page: 1, limit: 12 }));
  };

  const getAvailable = (slots) => slots?.filter((s) => s.status === 'AVAILABLE').length || 0;
  const hasAuction = (slots) => slots?.some((s) => s.auctionOpen);

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '44px 32px' }}>
      <SEO
        title="Browse EV Charging Stations"
        description="Explore our network of EV charging stations. Filter by city, price, and rating to find the perfect charging spot, then book instantly."
      />
      <div style={{ marginBottom: 32 }}>
        <h1 className="section-title">
          Charging <span>Stations</span>
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Find and book nearby EV charging stations
        </p>
      </div>

      {/* Search bar + view toggle */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
          marginBottom: 32,
          flexWrap: 'wrap',
        }}
      >
        <form
          onSubmit={handleSearch}
          style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}
        >
          <input
            className="form-control"
            placeholder="City..."
            value={filters.city}
            onChange={(e) => setFilters({ ...filters, city: e.target.value })}
            style={{ maxWidth: 160 }}
          />
          <input
            className="form-control"
            placeholder="Station name..."
            value={filters.name}
            onChange={(e) => setFilters({ ...filters, name: e.target.value })}
            style={{ maxWidth: 180 }}
          />
          <input
            type="number"
            step="0.01"
            min="0"
            className="form-control"
            placeholder="Max price/kWh"
            value={filters.maxPrice}
            onChange={(e) => setFilters({ ...filters, maxPrice: e.target.value })}
            style={{ maxWidth: 140 }}
          />
          <select
            className="form-select"
            value={filters.minRating}
            onChange={(e) => setFilters({ ...filters, minRating: e.target.value })}
            style={{ maxWidth: 140 }}
          >
            <option value="">Any rating</option>
            {[4, 3, 2, 1].map((r) => (
              <option key={r} value={r}>
                {r}+ stars
              </option>
            ))}
          </select>
          <button type="submit" className="btn-gold" style={{ padding: '10px 24px' }}>
            Search
          </button>
          {hasActiveFilters && (
            <button
              type="button"
              className="btn-outline-gold"
              style={{ padding: '10px 16px' }}
              onClick={handleClear}
            >
              Clear
            </button>
          )}
        </form>

        <div
          style={{
            display: 'flex',
            border: '1.5px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            overflow: 'hidden',
          }}
        >
          <button
            type="button"
            onClick={() => setView('list')}
            aria-label="List view"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '9px 16px',
              border: 'none',
              cursor: 'pointer',
              background: view === 'list' ? 'var(--primary)' : 'var(--bg-surface)',
              color: view === 'list' ? 'var(--on-dark)' : 'var(--text-secondary)',
              fontSize: '0.82rem',
              fontWeight: 600,
            }}
          >
            <List size={15} /> List
          </button>
          <button
            type="button"
            onClick={() => setView('map')}
            aria-label="Map view"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '9px 16px',
              border: 'none',
              cursor: 'pointer',
              background: view === 'map' ? 'var(--primary)' : 'var(--bg-surface)',
              color: view === 'map' ? 'var(--on-dark)' : 'var(--text-secondary)',
              fontSize: '0.82rem',
              fontWeight: 600,
            }}
          >
            <MapIcon size={15} /> Map
          </button>
        </div>
      </div>

      {loading ? (
        <div className="row g-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="col-12 col-md-6 col-lg-4">
              <SkeletonCard />
            </div>
          ))}
        </div>
      ) : error && stations.length === 0 ? (
        <EmptyState
          icon={<Zap size={48} color="var(--error)" strokeWidth={1.5} />}
          title="Couldn't load stations"
          subtitle="Something went wrong on our end — try again in a moment."
          action={
            <button className="btn-primary" onClick={() => dispatch(fetchStations(activeParams()))}>
              Try Again
            </button>
          }
        />
      ) : stations.length === 0 ? (
        <EmptyState
          icon={<Zap size={48} color="var(--text-muted)" strokeWidth={1.5} />}
          title="No stations found"
          subtitle={
            hasActiveFilters
              ? 'Try a different city, name, or price range.'
              : 'Check back later — new stations are added regularly.'
          }
          action={
            hasActiveFilters ? (
              <button className="btn-primary" onClick={handleClear}>
                Adjust Filters
              </button>
            ) : undefined
          }
        />
      ) : view === 'map' ? (
        <StationsMap stations={stations} />
      ) : (
        <>
          <div className="row g-4">
            {stations.map((s, i) => (
              <div key={s.id} className="col-12 col-md-6 col-lg-4">
                <motion.article
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="ev-card"
                  style={{ padding: 24, height: '100%', display: 'flex', flexDirection: 'column' }}
                >
                  {s.images?.[0] && (
                    <img
                      src={s.images[0]}
                      alt={s.name}
                      loading="lazy"
                      style={{
                        width: 'calc(100% + 48px)',
                        height: 140,
                        objectFit: 'cover',
                        margin: '-24px -24px 16px',
                        borderRadius: 'var(--radius) var(--radius) 0 0',
                        display: 'block',
                      }}
                    />
                  )}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: 12,
                    }}
                  >
                    <h2
                      style={{
                        fontFamily: 'Georgia, "Times New Roman", serif',
                        fontWeight: 700,
                        fontSize: '1.45rem',
                        letterSpacing: '0.02em',
                        flex: 1,
                        marginRight: 8,
                      }}
                    >
                      {s.name}
                    </h2>
                    {hasAuction(s.slots) && (
                      <span
                        style={{
                          background: 'var(--warning-tint)',
                          color: 'var(--warning)',
                          border: '1px solid var(--warning-tint-border)',
                          padding: '3px 8px',
                          borderRadius: 4,
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          whiteSpace: 'nowrap',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <Trophy size={11} /> AUCTION
                      </span>
                    )}
                  </div>

                  <p
                    style={{
                      color: 'var(--text-muted)',
                      fontSize: '0.82rem',
                      marginBottom: 6,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <MapPin size={13} /> {s.address}, {s.city}
                  </p>

                  <div style={{ marginBottom: 14 }}>
                    <Stars value={s.ratingAvg || 0} count={s.ratingCount ?? 0} size={14} />
                  </div>

                  <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                    <div>
                      <p
                        style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginBottom: 2 }}
                      >
                        PRICE/kWh
                      </p>
                      <p
                        style={{
                          fontWeight: 700,
                          color: 'var(--primary)',
                          fontFamily: 'Inter',
                          fontSize: '1.1rem',
                        }}
                      >
                        {toPKR(s.pricePerKwh)}
                      </p>
                    </div>
                    <div>
                      <p
                        style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginBottom: 2 }}
                      >
                        AVAILABLE
                      </p>
                      <p
                        style={{
                          fontWeight: 700,
                          color: getAvailable(s.slots) > 0 ? 'var(--success)' : 'var(--danger)',
                          fontFamily: 'Inter',
                          fontSize: '1.1rem',
                        }}
                      >
                        {getAvailable(s.slots)}/{s.slots?.length || 0}
                      </p>
                    </div>
                    <div>
                      <p
                        style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginBottom: 2 }}
                      >
                        OWNER
                      </p>
                      <p style={{ fontWeight: 500, fontSize: '0.85rem' }}>{s.owner?.name}</p>
                    </div>
                  </div>

                  {/* Slot preview */}
                  <div
                    style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16, flex: 1 }}
                  >
                    {s.slots?.map((slot) => (
                      <div
                        key={slot.id}
                        title={`Slot ${slot.slotNumber} — ${slot.auctionOpen ? 'AUCTION' : slot.status}`}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 4,
                          background:
                            slot.status === 'AVAILABLE'
                              ? 'var(--success-tint)'
                              : slot.status === 'OCCUPIED'
                                ? 'var(--danger-tint)'
                                : slot.auctionOpen
                                  ? 'var(--warning-tint)'
                                  : 'var(--bg-elevated)',
                          border: `1px solid ${
                            slot.status === 'AVAILABLE'
                              ? 'var(--success-tint-border)'
                              : slot.status === 'OCCUPIED'
                                ? 'var(--danger-tint-border)'
                                : slot.auctionOpen
                                  ? 'var(--warning-tint-border)'
                                  : 'var(--border)'
                          }`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          color: slot.auctionOpen ? 'var(--warning)' : 'var(--text-muted)',
                        }}
                      >
                        {slot.auctionOpen ? <Zap size={14} /> : slot.slotNumber}
                      </div>
                    ))}
                  </div>

                  <Link to={`/stations/${s.id}`} style={{ textDecoration: 'none' }}>
                    <button
                      className="btn-primary"
                      style={{
                        width: '100%',
                        padding: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                      }}
                    >
                      View Details <ArrowRight size={15} />
                    </button>
                  </Link>
                </motion.article>
              </div>
            ))}
          </div>

          <Pagination
            page={page}
            totalPages={pagination?.pages}
            onChange={setPage}
            variant="standalone"
          />
        </>
      )}
    </div>
  );
}
