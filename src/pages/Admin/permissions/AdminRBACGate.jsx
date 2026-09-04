import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { getAdminSessionState } from '../../../utils/adminSession';

/**
 * Server-backed Permission and Role Gate for Admin Control Center.
 * Active role comes from the admin JWT after login. Free role switching is
 * DEV-only (preview); production always mirrors the token role.
 */

export const ADMIN_ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  FINANCE_ADMIN: 'FINANCE_ADMIN',
  TRADING_ADMIN: 'TRADING_ADMIN',
  SUPPORT_AGENT: 'SUPPORT_AGENT',
  RISK_ANALYST: 'RISK_ANALYST',
  MARKETING_ADMIN: 'MARKETING_ADMIN',
  OPERATIONS_ADMIN: 'OPERATIONS_ADMIN',
};

const ROLE_ALLOWED_DOMAINS = {
  [ADMIN_ROLES.SUPER_ADMIN]: null, // null = all
  // control-tower: server READ_OPS allows FINANCE / RISK / OPERATIONS landing
  [ADMIN_ROLES.FINANCE_ADMIN]: ['finance', 'betting', 'analytics', 'control-tower'],
  [ADMIN_ROLES.TRADING_ADMIN]: ['trading-risk', 'betting', 'sports', 'analytics'],
  [ADMIN_ROLES.SUPPORT_AGENT]: ['support', 'customers', 'communications'],
  [ADMIN_ROLES.RISK_ANALYST]: ['trading-risk', 'analytics', 'security-governance', 'control-tower'],
  [ADMIN_ROLES.MARKETING_ADMIN]: ['growth', 'communications', 'analytics'],
  [ADMIN_ROLES.OPERATIONS_ADMIN]: ['operations', 'platform', 'analytics', 'betting', 'support', 'api-explorer', 'communications', 'customers', 'control-tower'],
};

export { ROLE_ALLOWED_DOMAINS };

export const PERMISSIONS = {
  VIEW_CUSTOMERS: 'VIEW_CUSTOMERS',
  EDIT_CUSTOMERS: 'EDIT_CUSTOMERS',
  VIEW_PII: 'VIEW_PII',
  APPROVE_WITHDRAWAL: 'APPROVE_WITHDRAWAL',
  MANAGE_TRADING: 'MANAGE_TRADING',
  SETTLE_BETS: 'SETTLE_BETS',
  MANAGE_SUPPORT: 'MANAGE_SUPPORT',
  MANAGE_MARKETING: 'MANAGE_MARKETING',
  VIEW_SECURITY: 'VIEW_SECURITY',
  MANAGE_PLATFORM: 'MANAGE_PLATFORM',
};

export function hasPermission(role, permission) {
  if (!role || role === ADMIN_ROLES.SUPER_ADMIN) return true;

  switch (permission) {
    case PERMISSIONS.VIEW_CUSTOMERS:
      return role === ADMIN_ROLES.SUPPORT_AGENT
        || role === ADMIN_ROLES.OPERATIONS_ADMIN
        || role === ADMIN_ROLES.RISK_ANALYST
        || role === ADMIN_ROLES.FINANCE_ADMIN;
    case PERMISSIONS.EDIT_CUSTOMERS:
      return role === ADMIN_ROLES.SUPPORT_AGENT
        || role === ADMIN_ROLES.OPERATIONS_ADMIN;
    case PERMISSIONS.VIEW_PII:
      return role === ADMIN_ROLES.SUPPORT_AGENT
        || role === ADMIN_ROLES.RISK_ANALYST
        || role === ADMIN_ROLES.OPERATIONS_ADMIN;
    case PERMISSIONS.APPROVE_WITHDRAWAL:
      return role === ADMIN_ROLES.FINANCE_ADMIN;
    case PERMISSIONS.MANAGE_TRADING:
      return role === ADMIN_ROLES.TRADING_ADMIN;
    case PERMISSIONS.SETTLE_BETS:
      return role === ADMIN_ROLES.TRADING_ADMIN
        || role === ADMIN_ROLES.FINANCE_ADMIN
        || role === ADMIN_ROLES.OPERATIONS_ADMIN;
    case PERMISSIONS.MANAGE_SUPPORT:
      return role === ADMIN_ROLES.SUPPORT_AGENT
        || role === ADMIN_ROLES.OPERATIONS_ADMIN;
    case PERMISSIONS.MANAGE_MARKETING:
      return role === ADMIN_ROLES.MARKETING_ADMIN;
    case PERMISSIONS.VIEW_SECURITY:
      return role === ADMIN_ROLES.OPERATIONS_ADMIN || role === ADMIN_ROLES.RISK_ANALYST;
    case PERMISSIONS.MANAGE_PLATFORM:
      return role === ADMIN_ROLES.OPERATIONS_ADMIN;
    default:
      return false;
  }
}

/** Check if a role can access a specific domain */
export function canAccessDomain(role, domainId, domainRequiredRole) {
  if (!role || role === ADMIN_ROLES.SUPER_ADMIN) return true;
  // Explicit allow-list for the active role (never open null-role domains to all admins).
  const allowed = ROLE_ALLOWED_DOMAINS[role];
  if (allowed === null) return true;
  if (allowed && domainId && allowed.includes(domainId)) return true;
  // Fallback: domain's declared required role matches.
  if (domainRequiredRole && role === domainRequiredRole) return true;
  return false;
}

function roleFromAdminJwt() {
  const session = getAdminSessionState();
  if (session.valid && session.payload?.role) return session.payload.role;
  return null;
}

// ── React Context for reactive role state ──

const AdminRoleContext = createContext({
  activeRole: ADMIN_ROLES.SUPER_ADMIN,
  setActiveRole: () => {},
  syncRoleFromJwt: () => {},
  rolePreviewEnabled: false,
});

export function AdminRoleProvider({ children }) {
  const rolePreviewEnabled = Boolean(import.meta.env.DEV);
  const [activeRole, setActiveRoleState] = useState(
    () => roleFromAdminJwt() || localStorage.getItem('adminRole') || ADMIN_ROLES.SUPER_ADMIN
  );

  const syncRoleFromJwt = useCallback(() => {
    const jwtRole = roleFromAdminJwt();
    if (!jwtRole) return jwtRole;
    setActiveRoleState(jwtRole);
    localStorage.setItem('adminRole', jwtRole);
    return jwtRole;
  }, []);

  // Keep UI role aligned with token after login / refresh (always).
  useEffect(() => {
    syncRoleFromJwt();
  }, [syncRoleFromJwt]);

  const setActiveRole = useCallback((newRole) => {
    // Production: ignore free switches — JWT is source of truth.
    if (!import.meta.env.DEV) {
      syncRoleFromJwt();
      return;
    }
    setActiveRoleState(newRole);
    localStorage.setItem('adminRole', newRole);
  }, [syncRoleFromJwt]);

  return (
    <AdminRoleContext.Provider value={{ activeRole, setActiveRole, syncRoleFromJwt, rolePreviewEnabled }}>
      {children}
    </AdminRoleContext.Provider>
  );
}

export function useAdminRole() {
  return useContext(AdminRoleContext);
}

// ── Gate Component ──

export default function AdminRBACGate({ requiredPermission, requiredRole, domainId, children, fallback }) {
  const { activeRole } = useAdminRole();

  // Role-based domain gate
  if (requiredRole && !canAccessDomain(activeRole, domainId, requiredRole)) {
    return fallback || (
      <div style={{
        padding: '48px 32px',
        textAlign: 'center',
        background: 'rgba(239, 68, 68, 0.06)',
        borderRadius: '14px',
        border: '1px solid rgba(239, 68, 68, 0.2)',
        margin: '24px',
        backdropFilter: 'blur(8px)',
      }}>
        <h3 className="admin-page-header__title" style={{ marginBottom: 8 }}>No access</h3>
        <p style={{ color: 'var(--admin-text-muted)', fontSize: '0.88rem', maxWidth: '400px', margin: '0 auto' }}>
          Role <strong>{activeRole}</strong> cannot open this module. Switch to {requiredRole} or SUPER_ADMIN.
        </p>
      </div>
    );
  }

  // Permission-based gate
  if (requiredPermission && !hasPermission(activeRole, requiredPermission)) {
    return fallback || (
      <div style={{
        padding: '48px 32px',
        textAlign: 'center',
        background: 'rgba(239, 68, 68, 0.06)',
        borderRadius: '14px',
        border: '1px solid rgba(239, 68, 68, 0.2)',
        margin: '24px',
        backdropFilter: 'blur(8px)',
      }}>
        <h3 className="admin-page-header__title" style={{ marginBottom: 8 }}>Not allowed</h3>
        <p style={{ color: 'var(--admin-text-muted)', fontSize: '0.88rem', maxWidth: '400px', margin: '0 auto' }}>
          <strong>{requiredPermission}</strong> needs a higher role.
        </p>
      </div>
    );
  }

  return children;
}
