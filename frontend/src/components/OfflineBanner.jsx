import { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

// navigator.onLine + the online/offline window events are the standard,
// zero-dependency way to detect connectivity changes in the browser. This
// is deliberately a visible, persistent banner rather than a toast — a
// toast can be missed or auto-dismisses; "why are my actions failing" is
// exactly the kind of thing that should stay on screen until it's resolved.
export default function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' && !navigator.onLine);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      role="status"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 2000,
        background: 'var(--error)', color: '#FDF8F0', textAlign: 'center',
        padding: '9px 16px', fontSize: '0.85rem', fontWeight: 600,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
      }}
    >
      <WifiOff size={16} /> You&apos;re offline — actions like booking or bidding won&apos;t go through until your connection is back.
    </div>
  );
}
