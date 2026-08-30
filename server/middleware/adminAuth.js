/**
 * Admin Authentication & RBAC Middleware — OddsYra Admin Operations
 * 
 * Verifies JWT tokens, extracts admin role, enforces RBAC permissions,
 * and ensures tenant isolation for all admin API routes.
 */

import { signHs256, verifyHs256 } from '../../lib/jwtHs256.mjs';

// Admin roles mirror the frontend RBAC system
const ADMIN_ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  FINANCE_ADMIN: 'FINANCE_ADMIN',
  TRADING_ADMIN: 'TRADING_ADMIN',
  SUPPORT_AGENT: 'SUPPORT_AGENT',
  RISK_ANALYST: 'RISK_ANALYST',
  MARKETING_ADMIN: 'MARKETING_ADMIN',
  OPERATIONS_ADMIN: 'OPERATIONS_ADMIN',
};

// Role → permitted domains mapping
const ROLE_PERMISSIONS = {
  SUPER_ADMIN: '*', // all permissions
  FINANCE_ADMIN: ['finance', 'betting', 'reconciliation', 'withdrawal', 'wallet'],
  TRADING_ADMIN: ['trading', 'betting', 'sports', 'markets', 'odds', 'risk'],
  SUPPORT_AGENT: ['support', 'customers', 'tickets', 'cases', 'kyc'],
  RISK_ANALYST: ['risk', 'fraud', 'analytics', 'security', 'reconciliation', 'kyc'],
  MARKETING_ADMIN: ['growth', 'promotions', 'communications', 'analytics'],
  OPERATIONS_ADMIN: ['operations', 'platform', 'providers', 'emergency', 'incidents', 'analytics', 'kyc', 'api-explorer'],
};

export function generateAdminToken(adminId, role, tenantId = 'oddsyra_in') {
  return signHs256({
    sub: adminId,
    role: role || ADMIN_ROLES.SUPER_ADMIN,
    tenant: tenantId,
    type: 'admin',
  }, '8h');
}

export function generateAdminMfaPendingToken(adminId, role, tenantId = 'oddsyra_in') {
  return signHs256({
    sub: adminId,
    role: role || ADMIN_ROLES.SUPER_ADMIN,
    tenant: tenantId,
    type: 'admin_mfa_pending',
  }, '5m');
}

export function verifyAdminToken(token) {
  return verifyHs256(token);
}

/**
 * Core admin authentication middleware.
 * Extracts admin identity from JWT or X-Admin-Role header (dev mode).
 * Attaches `req.admin` with { id, role, tenant }.
 */
export async function adminAuth(req, res, next) {
  // Extract token from Authorization header
  const authHeader = req.headers['authorization'];
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (token) {
    const decoded = verifyAdminToken(token);
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });
    }

    const { isPrivateAccessMode, isAuthorizedAdmin } = await import('../../lib/privateAccessConfig.mjs');
    if (isPrivateAccessMode()) {
      try {
        const { query } = await import('../../db/pg.js');
        const userRes = await query('SELECT email FROM users WHERE user_id = $1', [decoded.sub]);
        const email = userRes.rows[0]?.email;
        if (!email || !isAuthorizedAdmin(email)) {
          return res.status(403).json({
            error: 'Access to the platform is temporarily restricted.',
            message: 'Access to the platform is temporarily restricted.',
            code: 'PRIVATE_ACCESS_RESTRICTED',
          });
        }
      } catch {
        return res.status(500).json({ error: 'Internal error.', code: 'INTERNAL_ERROR' });
      }
    }

    const role = decoded.role;
    const isAdminRole = role && Object.values(ADMIN_ROLES).includes(role);
    const isUserAccess = decoded.type === 'access' || role === 'USER';
    if (isAdminRole && !isUserAccess && decoded.type === 'admin') {
      req.admin = {
        id: decoded.sub,
        role,
        tenant: decoded.tenant || 'oddsyra_in',
      };
      return next();
    }
    return res.status(403).json({ error: 'Admin access required', code: 'ADMIN_REQUIRED' });
  }

  // Test-only fallback: never in production (even under Vitest security suites)
  const allowTestAdminHeader = process.env.NODE_ENV !== 'production'
    && (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true');
  if (allowTestAdminHeader) {
    const headerRole = req.headers['x-admin-role'];
    if (headerRole && Object.values(ADMIN_ROLES).includes(headerRole)) {
      req.admin = {
        id: req.headers['x-admin-id'] || 'admin_test',
        role: headerRole,
        tenant: req.headers['x-tenant-id'] || 'oddsyra_in',
      };
      return next();
    }
  }

  import('../../lib/requestMetrics.mjs')
    .then(({ observeSecurityEvent }) => observeSecurityEvent('auth'))
    .catch(() => null);
  return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
}

/**
 * RBAC permission check middleware factory.
 * Usage: router.get('/route', adminAuth, requirePermission('finance'), handler)
 */
export function requirePermission(...domains) {
  return (req, res, next) => {
    const role = req.admin?.role;
    if (!role) {
      return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
    }

    // SUPER_ADMIN bypasses all checks
    if (role === ADMIN_ROLES.SUPER_ADMIN) return next();

    const allowed = ROLE_PERMISSIONS[role];
    if (!allowed) {
      return res.status(403).json({ error: 'Unknown role', code: 'UNKNOWN_ROLE' });
    }

    if (allowed === '*') return next();

    const hasPermission = domains.some(d => allowed.includes(d));
    if (!hasPermission) {
      import('../../lib/requestMetrics.mjs')
        .then(({ observeSecurityEvent }) => observeSecurityEvent('authorization'))
        .catch(() => null);
      return res.status(403).json({
        error: `Role ${role} does not have access to [${domains.join(', ')}]`,
        code: 'PERMISSION_DENIED',
        requiredDomains: domains,
        currentRole: role,
      });
    }

    return next();
  };
}

/**
 * Require specific admin roles.
 * Usage: router.post('/route', adminAuth, requireRole('SUPER_ADMIN', 'FINANCE_ADMIN'), handler)
 */
export function requireRole(...roles) {
  const flatRoles = roles.flat(Infinity).map(String);
  return (req, res, next) => {
    const adminRole = req.admin?.role;
    if (!adminRole) {
      return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
    }

    // SUPER_ADMIN always allowed
    if (adminRole === ADMIN_ROLES.SUPER_ADMIN) return next();

    if (!flatRoles.includes(adminRole)) {
      import('../../lib/requestMetrics.mjs')
        .then(({ observeSecurityEvent }) => observeSecurityEvent('authorization'))
        .catch(() => null);
      return res.status(403).json({
        error: `Role ${adminRole} is not authorized. Required: [${flatRoles.join(', ')}]`,
        code: 'ROLE_DENIED',
        requiredRoles: flatRoles,
        currentRole: adminRole,
      });
    }

    return next();
  };
}

export { ADMIN_ROLES, ROLE_PERMISSIONS };
