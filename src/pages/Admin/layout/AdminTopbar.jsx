import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  SearchIcon,
  BellRingIcon,
  ShieldCheckIcon,
  LogOutIcon,
  MenuIcon,
} from '../../../icons/animate/index';
import ThemeToggle from '../../../components/ThemeToggle/ThemeToggle';
import { ADMIN_ROLES } from '../permissions/AdminRBACGate';
import AdminProfileModal from '../components/AdminProfileModal';

function AdminProfileSection({ activeRole, onLogout }) {
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileData, setProfileData] = useState(null);

  const fetchProfile = () => {
    import('../api/adminApiClient').then(({ adminApiClient }) => {
      adminApiClient.get('/security/me')
        .then((data) => setProfileData(data))
        .catch(() => {});
    });
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const initials = profileData?.first_name
    ? `${profileData.first_name[0] || ''}${profileData.last_name?.[0] || ''}`.toUpperCase()
    : 'UR';
  const displayName = profileData?.display_name || `${profileData?.first_name || ''} ${profileData?.last_name || ''}`.trim() || 'Superuser';

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => setIsProfileModalOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            textAlign: 'left',
          }}
          title="Click to edit admin email, password, and profile details"
        >
          <div style={{ position: 'relative' }}>
            <motion.div
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '0.78rem',
                flexShrink: 0,
                border: '1.5px solid rgba(255, 255, 255, 0.2)',
              }}
            >
              {initials}
            </motion.div>
            <span style={{
              position: 'absolute',
              bottom: '0',
              right: '0',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#10b981',
              border: '1.5px solid var(--admin-panel)',
            }} />
          </div>
          <div style={{ fontSize: '0.76rem', whiteSpace: 'nowrap' }}>
            <div style={{ fontWeight: 700, color: 'var(--admin-text)', lineHeight: 1.2 }}>{displayName}</div>
            <div style={{ fontSize: '0.66rem', color: 'var(--admin-text-muted)' }}>{activeRole} ⚙</div>
          </div>
        </button>

        <motion.button
          type="button"
          onClick={onLogout}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.93 }}
          title="Sign out"
          className="admin-btn admin-btn--ghost admin-btn--icon"
          style={{
            width: '30px',
            height: '30px',
            marginLeft: '2px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#fb7185';
            e.currentTarget.style.borderColor = 'rgba(244, 63, 94, 0.3)';
            e.currentTarget.style.background = 'rgba(244, 63, 94, 0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--admin-text-muted)';
            e.currentTarget.style.borderColor = 'transparent';
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <LogOutIcon size={14} />
        </motion.button>
      </div>

      <AdminProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        onUpdated={fetchProfile}
      />
    </>
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
  return (
    <header className="admin-shell__topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
        {/* Mobile hamburger */}
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

        {/* Breadcrumbs */}
        {currentDomainLabel && (
          <div className="admin-breadcrumbs" style={{ display: 'none' }} data-desktop-breadcrumbs>
            {onBreadcrumbHome ? (
              <button type="button" className="admin-breadcrumbs__link" onClick={onBreadcrumbHome}>
                Admin
              </button>
            ) : (
              <span style={{ color: 'var(--admin-text-dim)' }}>Admin</span>
            )}
            <span className="admin-breadcrumbs__sep">›</span>
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
            {currentSubLabel && (
              <>
                <span className="admin-breadcrumbs__sep">›</span>
                <span className="admin-breadcrumbs__current" style={{ color: 'var(--admin-text-secondary)' }}>{currentSubLabel}</span>
              </>
            )}
          </div>
        )}

        {/* Global Search */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', minWidth: '200px', flex: 1, maxWidth: '340px' }}>
          <span style={{
            position: 'absolute',
            left: '11px',
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '16px',
            height: '16px',
            color: 'var(--admin-text-muted)',
            pointerEvents: 'none',
            zIndex: 2,
          }}>
            <SearchIcon size={14} style={{ display: 'block' }} />
          </span>
          <motion.input
            whileFocus={{ scale: 1.01, borderColor: '#6366f1', boxShadow: '0 0 0 3px rgba(99, 102, 241, 0.18)' }}
            type="search"
            placeholder="Search email, mobile, users, bets…"
            value={globalSearch}
            onChange={onSearchChange}
            onKeyDown={onSearchKeyDown}
            onClick={onSearchClick}
            className="admin-input"
            style={{
              padding: '7px 60px 7px 34px',
              borderRadius: 'var(--admin-radius-full)',
              width: '100%',
              cursor: 'text',
            }}
          />
          <span style={{
            position: 'absolute',
            right: '10px',
            top: '50%',
            transform: 'translateY(-50%)',
            padding: '2px 6px',
            borderRadius: '5px',
            background: 'rgba(255, 255, 255, 0.06)',
            border: '1px solid var(--admin-border)',
            color: 'var(--admin-text-dim)',
            fontSize: '0.66rem',
            fontWeight: 700,
            pointerEvents: 'none',
            lineHeight: 1.2,
          }}>
            ⌘K
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        <ThemeToggle />

        {/* Alerts Bell */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <motion.button
            ref={alertsBellRef}
            type="button"
            onClick={onToggleAlerts}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title={liveAlerts.length ? `Operational Alerts (${liveAlerts.length})` : 'No alerts'}
            aria-expanded={isAlertsOpen}
            aria-haspopup="dialog"
            className="admin-btn admin-btn--icon"
            style={{
              background: liveAlerts.length
                ? (isAlertsOpen ? 'rgba(244, 63, 94, 0.2)' : 'rgba(244, 63, 94, 0.1)')
                : 'transparent',
              color: liveAlerts.length ? '#fb7185' : 'var(--admin-text-muted)',
              border: liveAlerts.length
                ? '1px solid rgba(244, 63, 94, 0.3)'
                : '1px solid var(--admin-border)',
              borderRadius: '50%',
            }}
          >
            <BellRingIcon size={17} style={{ display: 'block' }} />
            {liveAlerts.length > 0 && (
              <span style={{
                position: 'absolute',
                top: '-3px',
                right: '-3px',
                background: '#f43f5e',
                color: '#fff',
                fontSize: '0.6rem',
                fontWeight: 900,
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid var(--admin-panel)',
                boxShadow: '0 2px 6px rgba(244, 63, 94, 0.4)',
                pointerEvents: 'none',
              }}>
                {liveAlerts.length}
              </span>
            )}
          </motion.button>
        </div>

        {/* RBAC Role Switcher */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          padding: '3px 8px 3px 9px',
          borderRadius: 'var(--admin-radius)',
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid var(--admin-border)',
        }}>
          <ShieldCheckIcon size={13} style={{ color: '#818cf8' }} />
          <span style={{ fontSize: '0.7rem', color: 'var(--admin-text-muted)', fontWeight: 650 }}>Role:</span>
          <select
            value={activeRole}
            onChange={(e) => onRoleChange(e.target.value)}
            className="admin-select"
            style={{
              padding: '2px 6px',
              borderRadius: 'var(--admin-radius-sm)',
              fontSize: '0.74rem',
              fontWeight: 700,
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

        <span style={{ width: '1px', height: '18px', background: 'var(--admin-border)' }} />

        {/* Profile & Logout */}
        <AdminProfileSection
          activeRole={activeRole}
          onLogout={onLogout}
        />
      </div>

      {/* Responsive: show mobile menu, hide breadcrumbs on small screens */}
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
