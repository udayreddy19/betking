import React from 'react';

/**
 * Standardized status badge component.
 * Variants: success, warning, danger, info, purple, neutral
 */
export default function AdminBadge({ children, variant = 'neutral', dot = true, className = '', style }) {
  const variantClass = `admin-badge--${variant}`;
  const dotColors = {
    success: '#10b981',
    warning: '#fbbf24',
    danger: '#f43f5e',
    info: '#818cf8',
    purple: '#c084fc',
    neutral: '#94a3b8',
  };

  return (
    <span className={`admin-badge ${variantClass} ${className}`} style={style}>
      {dot && (
        <span
          className="admin-badge--dot"
          style={{
            background: dotColors[variant] || dotColors.neutral,
            boxShadow: `0 0 6px ${dotColors[variant] || dotColors.neutral}`,
          }}
        />
      )}
      {children}
    </span>
  );
}

/**
 * Pre-configured status badge that auto-maps status strings to variants.
 */
export function StatusBadge({ status, customMap }) {
  const s = String(status || '').toUpperCase();

  const defaultMap = {
    success: ['ACTIVE', 'VERIFIED', 'APPROVED', 'CONFIGURED', 'HEALTHY', 'ONLINE', 'WON', 'COMPLETED', 'DELIVERED', 'SENT', 'LIVE'],
    warning: ['PENDING', 'UNDER_REVIEW', 'RESUBMISSION_REQUIRED', 'OPEN', 'ACCEPTED', 'DEGRADED', 'RETRYING', 'PROCESSING'],
    danger: ['REJECTED', 'FAILED', 'NOT_CONFIGURED', 'MISSING', 'DOWN', 'LOST', 'BLOCKED', 'RESTRICTED', 'SUSPENDED', 'ERROR', 'CRITICAL'],
    info: ['VOID', 'REFUNDED', 'CASHED_OUT', 'INFO'],
    purple: ['VIP', 'PREMIUM', 'ESCALATED'],
  };

  const map = customMap || defaultMap;
  let variant = 'neutral';
  for (const [v, keywords] of Object.entries(map)) {
    if (keywords.some((k) => s.includes(k))) {
      variant = v;
      break;
    }
  }

  return <AdminBadge variant={variant}>{status || '—'}</AdminBadge>;
}
