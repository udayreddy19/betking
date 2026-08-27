import React from 'react';

/**
 * Shared admin page header — title, optional breadcrumb trail, subtitle, actions.
 * Does not enforce RBAC; parents gate content.
 */
export default function AdminPageHeader({
  title,
  subtitle,
  breadcrumbs = [],
  actions = null,
  banner = null,
  className = '',
}) {
  return (
    <header className={`admin-page-header ${className}`.trim()}>
      {breadcrumbs.length > 0 && (
        <nav className="admin-breadcrumbs admin-page-header__crumbs" aria-label="Breadcrumb">
          {breadcrumbs.map((crumb, i) => {
            const isLast = i === breadcrumbs.length - 1;
            const label = typeof crumb === 'string' ? crumb : crumb.label;
            const onClick = typeof crumb === 'object' ? crumb.onClick : null;
            return (
              <React.Fragment key={`${label}-${i}`}>
                {i > 0 && <span className="admin-breadcrumbs__sep" aria-hidden="true">›</span>}
                {isLast || !onClick ? (
                  <span className={isLast ? 'admin-breadcrumbs__current' : undefined}>{label}</span>
                ) : (
                  <button type="button" className="admin-breadcrumbs__link" onClick={onClick}>
                    {label}
                  </button>
                )}
              </React.Fragment>
            );
          })}
        </nav>
      )}
      <div className="admin-page-header__row">
        <div className="admin-page-header__titles">
          <h2 className="admin-page-header__title">{title}</h2>
          {subtitle && <p className="admin-page-header__subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="admin-page-header__actions">{actions}</div>}
      </div>
      {banner}
    </header>
  );
}
