import React from 'react';

/**
 * Consistent empty state with icon, title, description, and optional CTA button.
 */
export default function AdminEmptyState({
  icon = '📭',
  title = 'No records found',
  description,
  actionLabel,
  onAction,
  className = '',
}) {
  return (
    <div className={`admin-empty-state ${className}`}>
      <div className="admin-empty-state__icon">{icon}</div>
      <h3 className="admin-empty-state__title">{title}</h3>
      {description && <p className="admin-empty-state__description">{description}</p>}
      {actionLabel && onAction && (
        <button
          type="button"
          className="admin-btn admin-btn--primary"
          onClick={onAction}
          style={{ marginTop: '16px' }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
