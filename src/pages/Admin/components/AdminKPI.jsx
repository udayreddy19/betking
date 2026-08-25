import React from 'react';

/**
 * KPI / Metric card with value, label, trend indicator, and click-to-navigate.
 */
export default function AdminKPI({
  label,
  value,
  trend,
  trendLabel,
  accent = 'var(--admin-primary)',
  icon,
  source,
  onClick,
  className = '',
  style,
}) {
  const trendColor = trend === 'up' ? '#10b981' : trend === 'down' ? '#f43f5e' : 'var(--admin-text-muted)';
  const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '';

  return (
    <div
      className={`telemetry-card ${className}`}
      style={{
        '--card-accent': accent,
        ...(onClick ? { cursor: 'pointer' } : {}),
        ...style,
      }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e); } } : undefined}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="telemetry-label">{label}</div>
        {icon && (
          <div style={{ color: accent, opacity: 0.7, flexShrink: 0 }}>
            {icon}
          </div>
        )}
      </div>
      <div className="telemetry-value">{value ?? '—'}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
        {(trend || trendLabel) && (
          <span style={{ fontSize: '0.74rem', fontWeight: 700, color: trendColor }}>
            {trendIcon}{trendLabel ? ` ${trendLabel}` : ''}
          </span>
        )}
        {source && (
          <span style={{
            fontSize: '0.66rem',
            color: 'var(--admin-text-dim)',
            padding: '1px 5px',
            borderRadius: '4px',
            background: 'rgba(148, 163, 184, 0.1)',
            fontWeight: 600,
          }}>
            {source}
          </span>
        )}
      </div>
    </div>
  );
}
