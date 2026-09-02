import React from 'react';

/**
 * Standardized status badge component.
 * Variants: success, warning, danger, info, purple, neutral
 */
export default function AdminBadge({ children, variant = 'neutral', dot = true, className = '', style }) {
  const variantClass = `admin-badge--${variant}`;
  const dotColors = {
    success: 'var(--admin-success)',
    warning: 'var(--admin-warning)',
    danger: 'var(--admin-danger)',
    info: 'var(--admin-info)',
    purple: 'var(--admin-accent-purple)',
    neutral: 'var(--admin-text-muted)',
  };

  return (
    <span className={`admin-badge ${variantClass} ${className}`} style={style}>
      {dot && (
        <span
          className="admin-badge--dot"
          style={{
            background: dotColors[variant] || dotColors.neutral,
          }}
        />
      )}
      {children}
    </span>
  );
}

function titleCaseStatus(status) {
  const raw = String(status || '').trim();
  if (!raw) return '—';
  return raw
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Pre-configured status badge that auto-maps status strings to variants.
 */
export function StatusBadge({ status, customMap }) {
  const s = String(status || '').toUpperCase();

  const defaultMap = {
    success: ['ACTIVE', 'VERIFIED', 'APPROVED', 'CONFIGURED', 'HEALTHY', 'ONLINE', 'WON', 'COMPLETED', 'DELIVERED', 'SENT', 'LIVE', 'MATCHED', 'RESOLVED', 'HEALTHY_RECONCILED', 'LOW'],
    warning: ['PENDING', 'UNDER_REVIEW', 'RESUBMISSION_REQUIRED', 'OPEN', 'ACCEPTED', 'DEGRADED', 'RETRYING', 'PROCESSING', 'WARNING', 'DISCREPANCY', 'DISCREPANCIES', 'MISMATCH', 'MEDIUM', 'HOLD', 'PENDING_REVIEW', 'PENDING_CHECKER'],
    danger: ['REJECTED', 'FAILED', 'NOT_CONFIGURED', 'MISSING', 'DOWN', 'LOST', 'BLOCKED', 'RESTRICTED', 'SUSPENDED', 'ERROR', 'CRITICAL', 'HIGH'],
    info: ['VOID', 'REFUNDED', 'CASHED_OUT', 'INFO', 'UNAVAILABLE', 'UNVERIFIED', 'MANUAL'],
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

  return <AdminBadge variant={variant}>{titleCaseStatus(status)}</AdminBadge>;
}
