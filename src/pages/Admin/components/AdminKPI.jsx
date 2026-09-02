import React from 'react';

/**
 * KPI / Metric card with value, label, trend indicator, and click-to-navigate.
 * Renders as a real <button> when onClick is provided so clicks are reliable.
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
  const trendColor = trend === 'up' ? 'var(--admin-success)' : trend === 'down' ? 'var(--admin-danger)' : 'var(--admin-text-muted)';
  const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '';
  const clickable = typeof onClick === 'function';
  const Tag = clickable ? 'button' : 'div';

  return (
    <Tag
      type={clickable ? 'button' : undefined}
      className={`telemetry-card ${clickable ? 'telemetry-card--clickable' : ''} ${className}`.trim()}
      style={{
        '--card-accent': accent,
        ...style,
      }}
      onClick={clickable ? onClick : undefined}
      aria-label={clickable ? `${label}: ${value ?? '—'} — view details` : undefined}
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
            color: clickable ? 'var(--admin-primary)' : 'var(--admin-text-dim)',
            padding: '1px 5px',
            borderRadius: '4px',
            background: clickable ? 'var(--admin-primary-soft)' : 'var(--admin-chip-bg)',
            fontWeight: 600,
          }}>
            {source}
          </span>
        )}
        {clickable && !source && (
          <span style={{
            fontSize: '0.66rem',
            color: 'var(--admin-primary)',
            padding: '1px 5px',
            borderRadius: '4px',
            background: 'var(--admin-primary-soft)',
            fontWeight: 600,
          }}>
            View →
          </span>
        )}
      </div>
    </Tag>
  );
}
