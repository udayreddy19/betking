import React, { useState, useEffect } from 'react';

/**
 * Standardized tab bar / segmented control.
 * Replaces inline subtab implementations across domain views.
 */
export default function AdminTabs({ tabs = [], active, onChange, className = '', style }) {
  return (
    <div className={`admin-subtab-bar ${className}`} style={style} role="tablist">
      {tabs.map((tab) => {
        const id = typeof tab === 'string' ? tab : tab.id;
        const label = typeof tab === 'string' ? tab : tab.label;
        const count = typeof tab === 'object' ? tab.count : undefined;
        const isActive = active === id;

        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`admin-subtab${isActive ? ' active' : ''}`}
            onClick={() => onChange(id)}
          >
            {label}
            {count != null && (
              <span className="admin-subtab__count">{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Hub of related sub-views under one domain module.
 * `onTabChange` lets the shell keep `/admin/:domain/:sub` in sync.
 * `hideTabs` keeps hub state/routing without rendering a second pill row.
 */
export function AdminHub({ tabs, initialTab, children, onTabChange, hideTabs = false }) {
  const [tab, setTab] = useState(initialTab);
  useEffect(() => { setTab(initialTab); }, [initialTab]);

  const handleChange = (id) => {
    setTab(id);
    onTabChange?.(id);
  };

  return (
    <div>
      {!hideTabs && (
        <AdminTabs tabs={tabs} active={tab} onChange={handleChange} style={{ marginBottom: 16 }} />
      )}
      {typeof children === 'function' ? children(tab) : children}
    </div>
  );
}
