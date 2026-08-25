import React from 'react';

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
              <span style={{
                marginLeft: '6px',
                fontSize: '0.68rem',
                fontWeight: 800,
                opacity: 0.75,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
