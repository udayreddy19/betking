import React from 'react';
import { motion } from 'motion/react';
import { ChevronRightIcon, ChevronDownIcon, MenuIcon } from '../../../icons/animate/index';
import BrandLogo from '../../../components/BrandLogo/BrandLogo';

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
}) {
  const sidebarClasses = [
    'admin-shell__sidebar',
    collapsed ? 'admin-shell__sidebar--collapsed' : '',
    isMobileOpen ? 'is-mobile-open' : '',
  ].filter(Boolean).join(' ');

  return (
    <>
      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="admin-sidebar-overlay is-visible"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <motion.aside
        className={sidebarClasses}
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        {/* Brand Header */}
        <div style={{
          padding: collapsed ? '14px 8px' : '14px 16px',
          borderBottom: '1px solid var(--admin-border)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}>
          <BrandLogo size={collapsed ? 28 : 30} />
          <div className="admin-sidebar-brand-text" style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <h1 style={{
                margin: 0,
                fontSize: '0.92rem',
                fontWeight: 900,
                letterSpacing: '-0.01em',
                color: 'var(--admin-text)',
                lineHeight: 1.2,
              }}>
                ODDSYRA
              </h1>
              <span style={{
                fontSize: '0.6rem',
                fontWeight: 800,
                padding: '1px 5px',
                borderRadius: '4px',
                background: 'rgba(99, 102, 241, 0.15)',
                color: '#818cf8',
                border: '1px solid rgba(99, 102, 241, 0.25)',
                letterSpacing: '0.4px',
              }}>
                ADMIN
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
              <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#10b981',
                boxShadow: '0 0 6px #10b981',
                flexShrink: 0,
              }} />
              <span style={{
                fontSize: '0.62rem',
                color: '#10b981',
                fontWeight: 700,
                letterSpacing: '0.4px',
                textTransform: 'uppercase',
              }}>
                Control Center
              </span>
            </div>
          </div>

          {/* Collapse toggle (desktop) */}
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

        {/* Navigation Items */}
        <nav className="admin-shell__sidebar-nav" aria-label="Admin navigation">
          {domainGroups.map((group, idx) => (
            <div key={idx} style={{ marginBottom: '16px' }}>
              <div className="admin-sidebar-group-title">
                {group.title}
              </div>
              {group.items.map((domain) => {
                const isActive = activeDomain === domain.id;
                const isExpanded = !!expandedDomains[domain.id];
                const DomainIcon = domain.Icon;
                const hasSub = domain.subModules && domain.subModules.length > 0;

                return (
                  <div key={domain.id} className="admin-nav-item">
                    <div className="admin-nav-domain-row">
                      <button
                        type="button"
                        className={`admin-nav-domain${isActive ? ' is-active' : ''}`}
                        onClick={() => onDomainSelect(domain)}
                        aria-expanded={hasSub ? isExpanded : undefined}
                        title={collapsed ? domain.label : undefined}
                      >
                        <DomainIcon className="admin-nav-domain__icon" />
                        <span className="admin-nav-domain__label">{domain.label}</span>
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
                          return (
                            <button
                              key={sub.id}
                              type="button"
                              className={`admin-nav-sub${isSubActive ? ' is-active' : ''}`}
                              onClick={() => onSubModuleSelect(domain.id, sub.id)}
                            >
                              {sub.label}
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

        {/* Sidebar Footer */}
        <div className="admin-sidebar-footer-text" style={{
          padding: '12px 14px',
          borderTop: '1px solid var(--admin-border)',
          fontSize: '0.7rem',
          color: 'var(--admin-text-muted)',
          display: 'flex',
          flexDirection: 'column',
          gap: '3px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Sportsbook</span>
            <span style={{
              fontWeight: 800,
              color: '#10b981',
              fontSize: '0.64rem',
              padding: '1px 5px',
              borderRadius: '4px',
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.2)',
            }}>
              PRODUCTION
            </span>
          </div>
        </div>
      </motion.aside>
    </>
  );
}
