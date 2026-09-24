import React from 'react';
import { motion } from 'motion/react';
import {
  BellRingIcon,
  MenuIcon,
} from '../../../icons/animate/index';
import AdminProfileMenu from '../components/AdminProfileMenu';
import AdminThemeToggle from '../components/AdminThemeToggle';
import AdminThemePicker from '../components/AdminThemePicker';
import { ADMIN_ROLES } from '../permissions/AdminRBACGate';

/**
 * Admin topbar — alerts, role, profile, breadcrumbs, theme.
 * New UI is permanent; Classic toggle removed.
 */
export default function AdminTopbar({
  activeRole,
  onRoleChange,
  rolePreviewEnabled = false,
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
  onOpenProfile,
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
          className="admin-btn admin-btn--ghost admin-btn--icon admin-topbar__menu-btn"
          onClick={onOpenMobileSidebar}
          aria-label="Open navigation"
        >
          <MenuIcon size={20} />
        </button>

        {currentDomainLabel && (
          <div className="admin-breadcrumbs admin-topbar__breadcrumbs" aria-label="Breadcrumb">
            {onBreadcrumbHome ? (
              <button type="button" className="admin-breadcrumbs__link" onClick={onBreadcrumbHome}>
                Admin
              </button>
            ) : (
              <span className="admin-breadcrumbs__muted">Admin</span>
            )}
            <span className="admin-breadcrumbs__sep">/</span>
            {onBreadcrumbDomain ? (
              <button
                type="button"
                className={showSub ? 'admin-breadcrumbs__link' : 'admin-breadcrumbs__current admin-breadcrumbs__link'}
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
                <span className="admin-breadcrumbs__current admin-breadcrumbs__sub">{currentSubLabel}</span>
              </>
            )}
          </div>
        )}

        {currentDomainLabel && (
          <div className="admin-topbar__mobile-title" aria-hidden="true">
            <span className="admin-topbar__mobile-domain">{currentDomainLabel}</span>
            {showSub && <span className="admin-topbar__mobile-sub">{currentSubLabel}</span>}
          </div>
        )}
      </div>

      <div className="admin-topbar__actions">
        <div className="admin-topbar__theme-cluster">
          <AdminThemeToggle />
          <AdminThemePicker />
        </div>

        <div className="admin-topbar__alerts-wrap">
          <motion.button
            ref={alertsBellRef}
            type="button"
            onClick={onToggleAlerts}
            whileTap={{ scale: 0.97 }}
            title={liveAlerts.length ? `Alerts (${liveAlerts.length})` : 'No alerts'}
            aria-expanded={isAlertsOpen}
            aria-haspopup="dialog"
            className="admin-btn admin-btn--icon admin-topbar__alert-btn"
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
          <span className="admin-topbar__role-label">
            {rolePreviewEnabled ? 'Role (preview)' : 'Role'}
          </span>
          {rolePreviewEnabled ? (
            <select
              value={activeRole}
              onChange={(e) => onRoleChange(e.target.value)}
              className="admin-select admin-topbar__role-select"
              title="DEV only — UI preview; JWT role is unchanged"
            >
              {Object.values(ADMIN_ROLES).map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
          ) : (
            <span className="admin-topbar__role-value">{activeRole}</span>
          )}
        </div>

        <AdminProfileMenu
          activeRole={activeRole}
          onLogout={onLogout}
          onOpenProfile={onOpenProfile}
        />
      </div>
    </header>
  );
}
