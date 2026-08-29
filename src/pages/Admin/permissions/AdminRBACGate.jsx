import React, { createContext, useContext, useState, useCallback } from 'react';

/**
 * Server-backed Permission and Role Gate for Admin Control Center.
 * Uses React Context so role changes from the header dropdown
 * are reactive and trigger re-renders across all gated components.
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
  [ADMIN_ROLES.FINANCE_ADMIN]: ['finance', 'betting'],
  [ADMIN_ROLES.TRADING_ADMIN]: ['trading-risk', 'betting', 'sports'],
  [ADMIN_ROLES.SUPPORT_AGENT]: ['support', 'customers'],
  [ADMIN_ROLES.RISK_ANALYST]: ['trading-risk', 'analytics', 'security-governance'],
  [ADMIN_ROLES.MARKETING_ADMIN]: ['growth', 'communications', 'analytics'],
  [ADMIN_ROLES.OPERATIONS_ADMIN]: ['operations', 'platform', 'analytics', 'betting', 'support', 'api-explorer'],
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
    case PERMISSIONS.VIEW_PII:
      return role === ADMIN_ROLES.SUPER_ADMIN
        || role === ADMIN_ROLES.SUPPORT_AGENT
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
    default:
      return true;
  }
}

/** Check if a role can access a specific domain */
export function canAccessDomain(role, domainId, domainRequiredRole) {
  if (!role || role === ADMIN_ROLES.SUPER_ADMIN) return true;
  // Domains with no required role are accessible to everyone
  if (!domainRequiredRole) return true;
  // Check explicit role match
  if (role === domainRequiredRole) return true;
  // Check allowed domains list
  const allowed = ROLE_ALLOWED_DOMAINS[role];
  if (allowed && allowed.includes(domainId)) return true;
  return false;
}

// ── React Context for reactive role state ──

const AdminRoleContext = createContext({
  activeRole: ADMIN_ROLES.SUPER_ADMIN,
  setActiveRole: () => {},
});

export function AdminRoleProvider({ children }) {
  const [activeRole, setActiveRoleState] = useState(
    () => localStorage.getItem('adminRole') || ADMIN_ROLES.SUPER_ADMIN
  );

  const setActiveRole = useCallback((newRole) => {
    setActiveRoleState(newRole);
    localStorage.setItem('adminRole', newRole);
  }, []);

  return (
    <AdminRoleContext.Provider value={{ activeRole, setActiveRole }}>
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
        <div style={{ fontSize: '2.4rem', marginBottom: '12px' }}>🔒</div>
        <h3 style={{ color: '#ef4444', marginBottom: '8px', fontSize: '1.1rem', fontWeight: 800 }}>Access Restricted</h3>
        <p style={{ color: 'var(--admin-text-muted, #9ca3af)', fontSize: '0.88rem', maxWidth: '400px', margin: '0 auto' }}>
          Your active role <strong style={{ color: '#f59e0b' }}>{activeRole}</strong> does not have access to this operational module.
          Switch to <strong style={{ color: '#60a5fa' }}>{requiredRole}</strong> or <strong style={{ color: '#60a5fa' }}>SUPER_ADMIN</strong> to proceed.
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
        <div style={{ fontSize: '2.4rem', marginBottom: '12px' }}>⛔</div>
        <h3 style={{ color: '#ef4444', marginBottom: '8px', fontSize: '1.1rem', fontWeight: 800 }}>Permission Denied</h3>
        <p style={{ color: 'var(--admin-text-muted, #9ca3af)', fontSize: '0.88rem', maxWidth: '400px', margin: '0 auto' }}>
          Action <strong style={{ color: '#f59e0b' }}>{requiredPermission}</strong> requires elevated authorization.
        </p>
      </div>
    );
  }

  return children;
}
