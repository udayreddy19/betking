import React from 'react';

/**
 * Reusable card wrapper with optional accent color, title, subtitle, and actions.
 */
export default function AdminCard({
  title,
  subtitle,
  accent,
  children,
  actions,
  className = '',
  style,
  noPadding = false,
  onClick,
}) {
  return (
    <div
      className={`admin-card ${className}`}
      style={{
        ...style,
        ...(accent ? { '--card-accent': accent } : {}),
        ...(noPadding ? { padding: 0 } : {}),
        ...(onClick ? { cursor: 'pointer' } : {}),
      }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e); } } : undefined}
    >
      {(title || actions) && (
        <div className="admin-card__header">
          <div>
            {title && <h3 className="admin-card__title">{title}</h3>}
            {subtitle && <p className="admin-card__subtitle">{subtitle}</p>}
          </div>
          {actions && <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
