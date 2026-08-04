import { useState, useEffect, useCallback } from 'react';
import { FiChevronLeft, FiChevronRight } from '../../icons';
import './PromoBanner.css';

export default function PromoBanner({ promos }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const total = promos?.length || 0;

  const nextSlide = useCallback(() => {
    if (total <= 1) return;
    setActiveIndex((prev) => (prev + 1) % total);
  }, [total]);

  const prevSlide = useCallback(() => {
    if (total <= 1) return;
    setActiveIndex((prev) => (prev - 1 + total) % total);
  }, [total]);

  useEffect(() => {
    if (total <= 1) return undefined;
    const timer = setInterval(() => {
      nextSlide();
    }, 4500);
    return () => clearInterval(timer);
  }, [total, nextSlide]);

  if (!promos || total === 0) return null;

  return (
    <div className="promo-banner" id="promo-banner">
      <div className="promo-banner-container" style={{ position: 'relative' }}>
        <div
          className="promo-carousel"
          style={{
            display: 'flex',
            gap: '16px',
            overflowX: 'auto',
            scrollSnapType: 'x mandatory',
            paddingBottom: '10px',
            scrollbarWidth: 'none',
          }}
        >
          {promos.map((promo, idx) => (
            <div
              key={promo.id}
              className={`promo-card ${idx === activeIndex ? 'active' : ''}`}
              style={{
                background: promo.bgColor || 'linear-gradient(135deg, #1e1b4b 0%, #311b92 100%)',
                borderRadius: '16px',
                padding: '24px',
                color: '#ffffff',
                minWidth: '320px',
                flex: '1',
                scrollSnapAlign: 'start',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
                border: idx === activeIndex ? '2px solid #7c3aed' : '1px solid rgba(255, 255, 255, 0.1)',
                transition: 'all 0.3s ease',
              }}
            >
              <span
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  color: '#ffffff',
                  padding: '4px 10px',
                  borderRadius: '20px',
                  fontSize: '0.65rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
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

        {total > 1 && (
          <div
            className="promo-controls"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              marginTop: '10px',
            }}
          >
            <button
              type="button"
              className="promo-nav-btn"
              onClick={prevSlide}
              aria-label="Previous promotion"
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                color: '#fff',
                borderRadius: '50%',
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <FiChevronLeft size={16} />
            </button>
            {promos.map((p, i) => (
              <button
                key={p.id}
                type="button"
                className={`promo-dot ${i === activeIndex ? 'active' : ''}`}
                onClick={() => setActiveIndex(i)}
                aria-label={`Go to slide ${i + 1}`}
                style={{
                  width: i === activeIndex ? '20px' : '8px',
                  height: '8px',
                  borderRadius: '4px',
                  background: i === activeIndex ? '#7c3aed' : 'rgba(255,255,255,0.3)',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              />
            ))}
            <button
              type="button"
              className="promo-nav-btn"
              onClick={nextSlide}
              aria-label="Next promotion"
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                color: '#fff',
                borderRadius: '50%',
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <FiChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
