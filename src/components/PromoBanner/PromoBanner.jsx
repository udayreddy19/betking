import { useState } from 'react';
import './PromoBanner.css';

export default function PromoBanner({ promos }) {
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <div className="promo-banner" id="promo-banner">
      <div className="promo-carousel">
        {promos.map((promo, index) => (
          <div
            key={promo.id}
            className="promo-card"
            style={{ background: promo.gradient }}
          >
            <span className="promo-tag">{promo.title}</span>
            <h3>{promo.subtitle}</h3>
            <p>{promo.description}</p>
          </div>
        ))}
      </div>
      <div className="promo-dots">
        {promos.slice(0, 4).map((_, idx) => (
          <button
            key={idx}
            className={`promo-dot ${idx === activeIndex ? 'active' : ''}`}
            onClick={() => setActiveIndex(idx)}
            aria-label={`Slide ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
