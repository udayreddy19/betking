import React from 'react';
import { motion } from 'motion/react';
import {
  SearchIcon,
  BellRingIcon,
  LogOutIcon,
  MenuIcon,
} from '../../../icons/animate/index';
import ThemeToggle from '../../../components/ThemeToggle/ThemeToggle';
import { ADMIN_ROLES } from '../permissions/AdminRBACGate';

function AdminProfileSection({ onLogout }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
      <div className="admin-topbar__avatar" aria-hidden="true">A</div>

      <motion.button
        type="button"
        onClick={onLogout}
        whileTap={{ scale: 0.97 }}
        title="Sign out"
        className="admin-btn admin-btn--ghost admin-btn--icon"
        style={{ width: '30px', height: '30px', marginLeft: '2px' }}
      >
        <LogOutIcon size={14} />
      </motion.button>
    </div>
  );
}

/**
 * Extracted Admin Topbar — search, alerts, RBAC role, profile, breadcrumbs.
 * All state and handlers are received via props from AdminShell.
 */
export default function AdminTopbar({
  globalSearch,
  onSearchChange,
  onSearchKeyDown,
  onSearchClick,
  activeRole,
  onRoleChange,
  liveAlerts,
  alertsBellRef,
  onToggleAlerts,
  isAlertsOpen,
  onLogout,
  onOpenMobileSidebar,
  currentDomainLabel,
  currentSubLabel,
  onBreadcrumbHome,
  onBreadcrumbDomain,
}) {
  const showSub = Boolean(
    currentSubLabel &&
    currentSubLabel.toLowerCase() !== String(currentDomainLabel || '').toLowerCase(),
  );

  return (
    <header className="admin-shell__topbar">
      <div className="admin-topbar__cluster">
        <button
          type="button"
          className="admin-btn admin-btn--ghost admin-btn--icon"
          onClick={onOpenMobileSidebar}
          aria-label="Open navigation"
          style={{ display: 'none' }}
          data-mobile-menu
        >
          <MenuIcon size={20} />
        </button>

        {currentDomainLabel && (
          <div className="admin-breadcrumbs" style={{ display: 'none' }} data-desktop-breadcrumbs>
            {onBreadcrumbHome ? (
              <button type="button" className="admin-breadcrumbs__link" onClick={onBreadcrumbHome}>
                Admin
              </button>
            ) : (
              <span style={{ color: 'var(--admin-text-dim)' }}>Admin</span>
            )}
            <span className="admin-breadcrumbs__sep">/</span>
            {onBreadcrumbDomain ? (
              <button
                type="button"
                className={currentSubLabel ? 'admin-breadcrumbs__link' : 'admin-breadcrumbs__current admin-breadcrumbs__link'}
                onClick={onBreadcrumbDomain}
              >
                {currentDomainLabel}
              </button>
            ) : (
              <span className="admin-breadcrumbs__current">{currentDomainLabel}</span>
            )}
            {showSub && (
              <>
                <span className="admin-breadcrumbs__sep">/</span>
                <span className="admin-breadcrumbs__current" style={{ color: 'var(--admin-text-secondary)' }}>{currentSubLabel}</span>
              </>
            )}
          </div>
        )}

        <div className="admin-topbar__search">
          <span className="admin-topbar__search-icon">
            <SearchIcon size={14} style={{ display: 'block' }} />
          </span>
          <input
            type="search"
            placeholder="Search email, mobile, users, bets…"
            value={globalSearch}
            onChange={onSearchChange}
            onKeyDown={onSearchKeyDown}
            onClick={onSearchClick}
            className="admin-input"
          />
          <span className="admin-topbar__kbd">⌘K</span>
        </div>
      </div>

      <div className="admin-topbar__actions">
        <ThemeToggle />

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <motion.button
            ref={alertsBellRef}
            type="button"
            onClick={onToggleAlerts}
            whileTap={{ scale: 0.97 }}
            title={liveAlerts.length ? `Alerts (${liveAlerts.length})` : 'No alerts'}
            aria-expanded={isAlertsOpen}
            aria-haspopup="dialog"
            className="admin-btn admin-btn--icon"
            style={{
              background: 'transparent',
              color: 'var(--admin-text-muted)',
              border: '1px solid var(--admin-border)',
              borderRadius: '50%',
            }}
          >
            <BellRingIcon size={17} style={{ display: 'block' }} />
            {liveAlerts.length > 0 && (
              <span className="admin-topbar__alert-count">
                {liveAlerts.length > 99 ? '99+' : liveAlerts.length}
              </span>
            )}
          </motion.button>
        </div>

        <div className="admin-topbar__role">
          <span style={{ fontSize: '0.7rem', color: 'var(--admin-text-muted)' }}>Role</span>
          <select
            value={activeRole}
            onChange={(e) => onRoleChange(e.target.value)}
            className="admin-select"
            style={{
              padding: '2px 6px',
              borderRadius: 'var(--admin-radius-sm)',
              fontSize: '0.74rem',
              fontWeight: 600,
              minWidth: 'auto',
              backgroundPosition: 'right 4px center',
              paddingRight: '18px',
            }}
          >
            {Object.values(ADMIN_ROLES).map((role) => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
        </div>

        <AdminProfileSection onLogout={onLogout} />
      </div>

      <style>{`
        @media (max-width: 1023px) {
          [data-mobile-menu] { display: inline-flex !important; }
        }
        @media (min-width: 1024px) {
          [data-desktop-breadcrumbs] { display: flex !important; }
        }
      `}</style>
    </header>
  );
}
