import React, { useState, useEffect, useMemo } from 'react';
import { attentionCountFor, useAdminNavAttention } from '../context/AdminNavAttentionContext';

function formatCount(n) {
  const count = Math.max(0, Number(n) || 0);
  if (count <= 0) return null;
  return count > 99 ? '99+' : String(count);
}

/**
 * Horizontal pill tabs (Ledger · Recon · …) — preferred in-module navigation.
 */
export default function AdminTabs({ tabs = [], active, onChange, className = '', style }) {
  return (
    <div className={`admin-subtab-bar ${className}`} style={style} role="tablist">
      {tabs.map((tab) => {
        const id = typeof tab === 'string' ? tab : tab.id;
        const label = typeof tab === 'string' ? tab : tab.label;
        const count = typeof tab === 'object' ? tab.count : undefined;
        const badge = formatCount(count);
        const isActive = active === id;

        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`admin-subtab${isActive ? ' active' : ''}${badge ? ' has-count' : ''}`}
            onClick={() => onChange(id)}
          >
            <span className="admin-subtab__label">{label}</span>
            {badge && (
              <span className="admin-subtab__count" aria-label={`${badge} pending`}>
                {badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Hub wrapper: horizontal tabs for a domain, with optional attention counts.
 * @param {string} [domainId] — when set, pulls counts from AdminNavAttention for each tab.id
 * @param {Record<string, number>} [counts] — explicit overrides { tabId: count }
 */
export function AdminHub({
  tabs,
  initialTab,
  domainId = null,
  counts = null,
  onTabChange = null,
  children,
}) {
  const attention = useAdminNavAttention();
  const [tab, setTab] = useState(initialTab);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const resolvedTabs = useMemo(
    () => (tabs || []).map((t) => {
      const id = typeof t === 'string' ? t : t.id;
      const label = typeof t === 'string' ? t : t.label;
      const explicit = counts?.[id] ?? (typeof t === 'object' ? t.count : undefined);
      const fromAttention = domainId ? attentionCountFor(attention, domainId, id) : undefined;
      const count = explicit != null ? explicit : fromAttention;
      return { id, label, count };
    }),
    [tabs, counts, domainId, attention],
  );

  const handleChange = (id) => {
    setTab(id);
    onTabChange?.(id);
  };

  return (
    <div>
      <AdminTabs tabs={resolvedTabs} active={tab} onChange={handleChange} style={{ marginBottom: 16 }} />
      {typeof children === 'function' ? children(tab) : children}
    </div>
  );
}
