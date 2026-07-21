import { useEffect, memo } from 'react';
import PropTypes from 'prop-types';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Link } from 'react-router-dom';
import { toPKR } from '../utils/pkr';
import { Stars } from './Stars';

// react-leaflet's default marker icon path breaks once bundled (Vite/webpack
// rewrite the image URLs), so point it at the same package's CDN copy
// instead of trying to resolve local asset paths.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Re-centers/fits the map whenever the station list changes (e.g. after a
// city search), instead of leaving the view stuck wherever it first loaded.
function FitBounds({ stations }) {
  const map = useMap();
  useEffect(() => {
    const valid = stations.filter(s => typeof s.latitude === 'number' && typeof s.longitude === 'number');
    if (valid.length === 0) return;
    if (valid.length === 1) {
      map.setView([valid[0].latitude, valid[0].longitude], 13);
    } else {
      const bounds = L.latLngBounds(valid.map(s => [s.latitude, s.longitude]));
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [stations, map]);
  return null;
}

// Leaflet map (re-)initialization is genuinely expensive (real DOM/canvas
// work, not just a plain re-render) — memo means Stations.jsx re-rendering
// for an unrelated reason (e.g. a filter input's local state) doesn't force
// the whole map to reinitialize when the `stations` array itself hasn't
// actually changed.
function StationsMap({ stations }) {
  const valid = stations.filter(s => typeof s.latitude === 'number' && typeof s.longitude === 'number');
  const center = valid.length ? [valid[0].latitude, valid[0].longitude] : [30.3753, 69.3451]; // Pakistan-ish default

  return (
    <div className="ev-card" style={{ overflow: 'hidden', height: 520 }}>
      <MapContainer center={center} zoom={6} style={{ height: '100%', width: '100%' }} scrollWheelZoom={true}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds stations={valid} />
        {valid.map(s => (
          <Marker key={s.id} position={[s.latitude, s.longitude]}>
            <Popup>
              <div style={{ minWidth: 180 }}>
                <p style={{ fontWeight: 700, marginBottom: 4 }}>{s.name}</p>
                {s.ratingCount > 0 && (
                  <div style={{ marginBottom: 4 }}><Stars value={s.ratingAvg} count={s.ratingCount} size={12} /></div>
                )}
                <p style={{ fontSize: '0.82rem', color: '#555', marginBottom: 6 }}>{s.address}, {s.city}</p>
                <p style={{ fontSize: '0.82rem', marginBottom: 8 }}>{toPKR(s.pricePerKwh)}/kWh</p>
                <Link to={`/stations/${s.id}`} style={{ fontSize: '0.82rem', fontWeight: 600 }}>View details →</Link>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

const stationShape = PropTypes.shape({
  id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  name: PropTypes.string,
  address: PropTypes.string,
  city: PropTypes.string,
  latitude: PropTypes.number,
  longitude: PropTypes.number,
  pricePerKwh: PropTypes.number,
  ratingAvg: PropTypes.number,
  ratingCount: PropTypes.number,
});

FitBounds.propTypes = {
  stations: PropTypes.arrayOf(stationShape).isRequired,
};

StationsMap.propTypes = {
  stations: PropTypes.arrayOf(stationShape).isRequired,
};

export default memo(StationsMap);
