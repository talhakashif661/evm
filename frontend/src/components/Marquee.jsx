import { Zap } from 'lucide-react';

const ITEMS = [
  '20% off your first booking with code CHARGE20',
  'New charging stations added daily',
  '24/7 customer support',
  'Bid on premium slots in the Auction Hub',
];

export default function Marquee() {
  // Render the list twice back-to-back so the CSS animation (which
  // translates by exactly -50%) loops seamlessly with no visible seam.
  const content = [...ITEMS, ...ITEMS];

  return (
    <div className="marquee-bar" aria-hidden="true">
      <div className="marquee-track">
        {content.map((text, i) => (
          <span key={i}>
            <Zap size={12} /> {text}
          </span>
        ))}
      </div>
    </div>
  );
}
