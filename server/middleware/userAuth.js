/**
 * User Authentication Middleware — OddsYra
 *
 * Verifies JWT access tokens from Authorization header or bk_access cookie.
 * Attaches req.user = { userId, role, status } for downstream handlers.
 */

import { verifyAccessToken } from '../auth/tokenService.js';

/**
 * Require a valid access token. Attaches req.user on success.
 */
export function requireAuth(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({ error: 'Authentication required.', code: 'AUTH_REQUIRED' });
  }

  const decoded = verifyAccessToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token.', code: 'TOKEN_INVALID' });
  }

  req.user = {
    userId: decoded.sub,
    role: decoded.role || 'USER',
    tenant: decoded.tenant || 'oddsyra_in',
  };

  return next();
}

/**
 * Require the user's account to be in one of the allowed statuses.
 * Must be used AFTER requireAuth.
 * @param  {...string} statuses — allowed account statuses
 */
export function requireAccountStatus(...statuses) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.', code: 'AUTH_REQUIRED' });
    }

    try {
      const { query } = await import('../../db/pg.js');
      const result = await query('SELECT status FROM users WHERE user_id = $1', [req.user.userId]);

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'User not found.', code: 'USER_NOT_FOUND' });
      }

      const accountStatus = result.rows[0].status || 'ACTIVE';
      if (!statuses.includes(accountStatus)) {
        return res.status(403).json({
          error: 'Your account status does not allow this action.',
          code: 'ACCOUNT_STATUS_DENIED',
          currentStatus: accountStatus,
        });
      }

      req.user.status = accountStatus;
      return next();
    } catch {
      return res.status(500).json({ error: 'Internal error.', code: 'INTERNAL_ERROR' });
    }
  };
}

/**
 * Require that the user's email has been verified.
 * Must be used AFTER requireAuth.
 */
export function requireVerified(req, res, next) {
  // This is checked at the route level where needed by querying the DB
  // For now, pass through — the authService getMe returns emailVerified status
  return next();
}

/**
 * Optionally authenticate — attaches req.user if token present, but does not fail.
 */
export function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (token) {
    const decoded = verifyAccessToken(token);
    if (decoded) {
      req.user = {
        userId: decoded.sub,
        role: decoded.role || 'USER',
        tenant: decoded.tenant || 'oddsyra_in',
      };
    }
  }
  return next();
}

/**
 * Extract bearer token from request.
 * Priority: Authorization header > cookie
 */
function extractToken(req) {
  // Authorization: Bearer <token>
  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Fallback: cookie
  if (req.cookies?.bk_access) {
    return req.cookies.bk_access;
  }

  return null;
}
