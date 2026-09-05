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

export function AdminHub({ tabs, initialTab, children }) {
  const [tab, setTab] = useState(initialTab);
  useEffect(() => { setTab(initialTab); }, [initialTab]);
  return (
    <div>
      <AdminTabs tabs={tabs} active={tab} onChange={setTab} style={{ marginBottom: 16 }} />
      {typeof children === 'function' ? children(tab) : children}
    </div>
  );
}
