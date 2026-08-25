import React from 'react';

/**
 * Activity timeline component for audit events, user activity, entity history.
 */
export default function AdminTimeline({ items = [], className = '' }) {
  if (!items.length) return null;

  return (
    <div className={`admin-timeline ${className}`}>
      {items.map((item, index) => (
        <div key={item.id || index} className="admin-timeline__item">
          <div
            className={`admin-timeline__dot${index === 0 ? ' admin-timeline__dot--active' : ''}`}
            style={item.color ? { background: item.color, boxShadow: `0 0 6px ${item.color}` } : undefined}
          />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
              {item.icon && <span style={{ fontSize: '0.82rem' }}>{item.icon}</span>}
              <span className="admin-timeline__text" style={{ fontWeight: 650 }}>
                {item.title || item.text}
              </span>
            </div>
            {item.description && (
              <div className="admin-timeline__text" style={{ fontSize: '0.78rem', opacity: 0.8 }}>
                {item.description}
              </div>
            )}
            {item.time && <div className="admin-timeline__time">{item.time}</div>}
            {item.actor && (
              <div style={{
                fontSize: '0.7rem',
                color: 'var(--admin-text-dim)',
                marginTop: '2px',
                fontWeight: 600,
              }}>
                by {item.actor}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
