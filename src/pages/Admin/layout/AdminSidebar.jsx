import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { ChevronRightIcon, ChevronDownIcon, MenuIcon } from '../../../icons/animate/index';
import BrandLogo from '../../../components/BrandLogo/BrandLogo';
import { canAccessDomain, useAdminRole } from '../permissions/AdminRBACGate';

function formatBadgeCount(n) {
  const count = Math.max(0, Number(n) || 0);
  if (count <= 0) return null;
  return count > 99 ? '99+' : String(count);
}

/**
 * Extracted Admin Sidebar — collapsible, mobile-drawer aware.
 * All navigation state and domain config is received via props from AdminShell.
 */
export default function AdminSidebar({
  domainGroups,
  activeDomain,
  activeSubModule,
  expandedDomains,
  onDomainSelect,
  onSubModuleSelect,
  onToggleExpand,
  collapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile,
  attention = null,
}) {
  const { activeRole } = useAdminRole();
  const visibleGroups = useMemo(
    () => domainGroups
      .map((group) => ({
        ...group,
        items: (group.items || []).filter((domain) => canAccessDomain(activeRole, domain.id, domain.role)),
      }))
      .filter((group) => group.items.length > 0),
    [domainGroups, activeRole],
  );

  const sidebarClasses = [
    'admin-shell__sidebar',
    collapsed ? 'admin-shell__sidebar--collapsed' : '',
    isMobileOpen ? 'is-mobile-open' : '',
  ].filter(Boolean).join(' ');

  const domainAttention = attention?.domains || {};
  const subAttention = attention?.subModules || {};

  return (
    <>
      {isMobileOpen && (
        <div
          className="admin-sidebar-overlay is-visible"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <motion.aside
        className={sidebarClasses}
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
      >
        <div className={`admin-sidebar-brand${collapsed ? ' admin-sidebar-brand--truncated' : ''}`}>
          <BrandLogo size={collapsed ? 26 : 28} />
          <div className="admin-sidebar-brand-text" style={{ minWidth: 0, flex: 1 }}>
            <h1 className="admin-sidebar-brand__name">OddsYra</h1>
            <div className="admin-sidebar-brand__meta">Admin</div>
          </div>

          {onToggleCollapse && (
            <button
              type="button"
              className="admin-btn admin-btn--ghost admin-btn--icon"
              onClick={onToggleCollapse}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              style={{ width: '28px', height: '28px', flexShrink: 0 }}
            >
              <MenuIcon size={16} />
            </button>
          )}
        </div>

        <nav className="admin-shell__sidebar-nav" aria-label="Admin navigation">
          {visibleGroups.map((group, idx) => (
            <div key={idx} style={{ marginBottom: '8px' }}>
              <div className="admin-sidebar-group-title">
                {group.title}
              </div>
              {group.items.map((domain) => {
                const isActive = activeDomain === domain.id;
                const isExpanded = !!expandedDomains[domain.id];
                const DomainIcon = domain.Icon;
                const hasSub = domain.subModules && domain.subModules.length > 0;
                const domainBadge = formatBadgeCount(domainAttention[domain.id]?.count);
                const domainTitle = domainAttention[domain.id]?.label
                  || (domainBadge ? `${domainBadge} pending` : domain.label);

                return (
                  <div key={domain.id} className="admin-nav-item">
                    <div className="admin-nav-domain-row">
                      <button
                        type="button"
                        className={`admin-nav-domain${isActive ? ' is-active' : ''}${domainBadge ? ' has-badge' : ''}`}
                        onClick={() => onDomainSelect(domain)}
                        aria-expanded={hasSub ? isExpanded : undefined}
                        title={collapsed ? `${domain.label}${domainBadge ? ` (${domainBadge})` : ''}` : domainTitle}
                      >
                        <span className="admin-nav-domain__icon-wrap">
                          <DomainIcon className="admin-nav-domain__icon" />
                          {collapsed && domainBadge && (
                            <span className="admin-nav-domain__badge admin-nav-domain__badge--dot" aria-hidden="true" />
                          )}
                        </span>
                        <span className="admin-nav-domain__label">{domain.label}</span>
                        {!collapsed && domainBadge && (
                          <span
                            className="admin-nav-domain__badge"
                            aria-label={`${domainBadge} pending in ${domain.label}`}
                          >
                            {domainBadge}
                          </span>
                        )}
                      </button>
                      {hasSub && !collapsed && (
                        <button
                          type="button"
                          className={`admin-nav-chevron${isExpanded ? ' is-open' : ''}${isActive ? ' is-active' : ''}`}
                          aria-label={isExpanded ? `Collapse ${domain.label}` : `Expand ${domain.label}`}
                          onClick={() => onToggleExpand(domain.id)}
                        >
                          {isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                        </button>
                      )}
                    </div>

                    {isExpanded && hasSub && !collapsed && (
                      <div className="admin-nav-subs">
                        {domain.subModules.map((sub) => {
                          const isSubActive = isActive && activeSubModule === sub.id;
                          const subBadge = formatBadgeCount(subAttention[`${domain.id}:${sub.id}`]?.count);
                          const subLabel = subAttention[`${domain.id}:${sub.id}`]?.label;
                          return (
                            <button
                              key={sub.id}
                              type="button"
                              className={`admin-nav-sub${isSubActive ? ' is-active' : ''}`}
                              onClick={() => onSubModuleSelect(domain.id, sub.id)}
                              title={subLabel || sub.label}
                            >
                              <span className="admin-nav-sub__label">{sub.label}</span>
                              {subBadge && (
                                <span
                                  className="admin-nav-sub__badge"
                                  aria-label={`${subBadge} pending in ${sub.label}`}
                                >
                                  {subBadge}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="admin-sidebar-footer-text admin-sidebar-footer">
          Production
        </div>
      </motion.aside>
    </>
  );
}
