import { useState } from 'react';
import './PromoBanner.css';

export default function PromoBanner({ promos }) {
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <div className="promo-banner" id="promo-banner">
      <div className="promo-carousel" style={{ display: 'flex', gap: '16px', overflowX: 'auto', paddingBottom: '10px' }}>
        {promos.map((promo) => (
          <div
            key={promo.id}
            className="promo-card"
            style={{
              background: promo.bgColor || 'linear-gradient(135deg, #1e1b4b 0%, #311b92 100%)',
              borderRadius: '16px',
              padding: '24px',
              color: '#ffffff',
              minWidth: '320px',
              flex: '1',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}
          >
            <span style={{
              background: 'rgba(255, 255, 255, 0.2)',
              color: '#ffffff',
              padding: '4px 10px',
              borderRadius: '20px',
              fontSize: '0.65rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              {promo.tag || 'PROMOTION'}
            </span>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: '#ffffff', margin: '10px 0 6px 0' }}>
              {promo.title}
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#e0e7ff', margin: 0, lineHeight: 1.4 }}>
              {promo.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
