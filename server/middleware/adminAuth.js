/**
 * Admin Authentication & RBAC Middleware — BetKing Admin Operations
 * 
 * Verifies JWT tokens, extracts admin role, enforces RBAC permissions,
 * and ensures tenant isolation for all admin API routes.
 */

import crypto from 'crypto';

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
  SUPPORT_AGENT: ['support', 'customers', 'tickets', 'cases'],
  RISK_ANALYST: ['risk', 'fraud', 'analytics', 'security', 'reconciliation'],
  MARKETING_ADMIN: ['growth', 'promotions', 'communications', 'analytics'],
  OPERATIONS_ADMIN: ['operations', 'platform', 'providers', 'emergency', 'incidents', 'analytics'],
};

/**
 * JWT Secret — in production this comes from env/secrets manager
 */
const JWT_SECRET = process.env.JWT_SECRET || 'betking_jwt_secret_dev_key_2026';

/**
 * Simple JWT verification (HS256)
 * In production, use a proper JWT library (jsonwebtoken).
 * This is a lightweight implementation for the admin panel.
 */
function verifyJWT(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;
    const expectedSig = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    if (expectedSig !== signatureB64) return null;

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

    // Check expiry
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;

    return payload;
  } catch {
    return null;
  }
}

/**
 * Generate a signed JWT for admin users
 */
export function generateAdminToken(adminId, role, tenantId = 'betking_in') {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: adminId,
    role: role || ADMIN_ROLES.SUPER_ADMIN,
    tenant: tenantId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (8 * 60 * 60), // 8 hours
  })).toString('base64url');

  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');

  return `${header}.${payload}.${signature}`;
}

/**
 * Core admin authentication middleware.
 * Extracts admin identity from JWT or X-Admin-Role header (dev mode).
 * Attaches `req.admin` with { id, role, tenant }.
 */
export function adminAuth(req, res, next) {
  // Extract token from Authorization header
  const authHeader = req.headers['authorization'];
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (token) {
    const decoded = verifyJWT(token);
    if (decoded) {
      req.admin = {
        id: decoded.sub,
        role: decoded.role || ADMIN_ROLES.SUPER_ADMIN,
        tenant: decoded.tenant || 'betking_in',
      };
      return next();
    }
  }

  // Test-only fallback: ONLY permitted when process.env.NODE_ENV === 'test'
  if (process.env.NODE_ENV === 'test') {
    const headerRole = req.headers['x-admin-role'];
    if (headerRole && Object.values(ADMIN_ROLES).includes(headerRole)) {
      req.admin = {
        id: req.headers['x-admin-id'] || 'admin_test',
        role: headerRole,
        tenant: req.headers['x-tenant-id'] || 'betking_in',
      };
      return next();
    }
  }

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
  return (req, res, next) => {
    const adminRole = req.admin?.role;
    if (!adminRole) {
      return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
    }

    // SUPER_ADMIN always allowed
    if (adminRole === ADMIN_ROLES.SUPER_ADMIN) return next();

    if (!roles.includes(adminRole)) {
      return res.status(403).json({
        error: `Role ${adminRole} is not authorized. Required: [${roles.join(', ')}]`,
        code: 'ROLE_DENIED',
        requiredRoles: roles,
        currentRole: adminRole,
      });
    }

    return next();
  };
}

export { ADMIN_ROLES, ROLE_PERMISSIONS };
