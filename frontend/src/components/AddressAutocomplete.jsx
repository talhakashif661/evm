import { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { MapPin, Loader2 } from 'lucide-react';

// Nominatim (OpenStreetMap's free geocoding search) — same no-API-key
// philosophy already used for the map/tiles elsewhere in this app. Usage
// policy (nominatim.org/release-docs/latest/api/Search/): keep request
// volume light and don't auto-fire on every keystroke — the debounce below
// and the 3-character minimum are there for exactly that, not just UX polish.
const DEBOUNCE_MS = 500;
const MIN_CHARS = 3;

/**
 * A text input that suggests real addresses as you type and, on selection,
 * hands back { address, city, latitude, longitude } so the parent form can
 * fill all four fields at once — instead of someone having to know their
 * own decimal coordinates to fill in a station's location.
 */
export default function AddressAutocomplete({ id, value, onChange, onSelect, placeholder }) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e) => {
    const text = e.target.value;
    onChange(text);
    clearTimeout(debounceRef.current);

    if (text.trim().length < MIN_CHARS) {
      setSuggestions([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&q=${encodeURIComponent(text)}`
        );
        const data = await res.json();
        setSuggestions(data);
        setOpen(true);
      } catch {
        // A failed geocode lookup shouldn't block manual entry — the plain
        // text field underneath still works, coordinates just won't
        // autofill for this search.
        setSuggestions([]);
      }
      setLoading(false);
    }, DEBOUNCE_MS);
  };

  const handleSelect = (result) => {
    const a = result.address || {};
    const city = a.city || a.town || a.village || a.county || '';
    onSelect({
      address: result.display_name,
      city,
      latitude: parseFloat(result.lat),
      longitude: parseFloat(result.lon),
    });
    setOpen(false);
    setSuggestions([]);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          id={id}
          type="text"
          className="form-control"
          placeholder={placeholder || 'Start typing an address...'}
          value={value}
          onChange={handleInputChange}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          autoComplete="off"
        />
        {loading && (
          <Loader2
            size={16}
            className="spin"
            style={{
              position: 'absolute',
              right: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
            }}
          />
        )}
      </div>
      {open && suggestions.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 20,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            marginTop: 4,
            boxShadow: 'var(--shadow-lg)',
            maxHeight: 220,
            overflowY: 'auto',
          }}
        >
          {suggestions.map((s) => (
            <button
              key={s.place_id}
              type="button"
              onClick={() => handleSelect(s)}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                width: '100%',
                padding: '10px 12px',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: '0.85rem',
                color: 'var(--text-primary)',
                borderBottom: '1px solid var(--border)',
              }}
              onMouseDown={(e) => e.preventDefault()}
            >
              <MapPin
                size={15}
                color="var(--accent-gold-dark)"
                style={{ flexShrink: 0, marginTop: 2 }}
              />
              <span>{s.display_name}</span>
            </button>
          ))}
        </div>
      )}
      <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
        Pick a suggestion to auto-fill city and coordinates, or type your own address and set them
        manually below.
      </small>
    </div>
  );
}

AddressAutocomplete.propTypes = {
  id: PropTypes.string,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  onSelect: PropTypes.func.isRequired,
  placeholder: PropTypes.string,
};
