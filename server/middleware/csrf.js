import crypto from 'crypto';
import { timingSafeEqualStrings } from '../../lib/cryptoUtils.mjs';

export const CSRF_COOKIE = 'bk_csrf';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export function issueCsrfCookie(res) {
  const token = crypto.randomBytes(32).toString('base64url');
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: IS_PRODUCTION,
    sameSite: IS_PRODUCTION ? 'strict' : 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  return token;
}

export function clearCsrfCookie(res) {
  res.clearCookie(CSRF_COOKIE, {
    httpOnly: false,
    secure: IS_PRODUCTION,
    sameSite: IS_PRODUCTION ? 'strict' : 'lax',
    path: '/',
  });
}

function csrfTokensMatch(req) {
  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const header = req.headers['x-csrf-token'] || req.headers['x-xsrf-token'] || '';
  if (!cookieToken) return false;
  return timingSafeEqualStrings(String(cookieToken), String(header));
}

/**
 * Double-submit CSRF when a CSRF cookie is present.
 */
export function requireCsrf(req, res, next) {
  const method = String(req.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();
  if (!req.cookies?.[CSRF_COOKIE]) return next();
  if (!csrfTokensMatch(req)) {
    import('../../lib/requestMetrics.mjs')
      .then(({ observeSecurityEvent }) => observeSecurityEvent('csrf'))
      .catch(() => null);
    return res.status(403).json({ error: 'CSRF validation failed', code: 'CSRF_REJECTED' });
  }
  return next();
}

/** Cookie-authenticated mutations (refresh/logout) must send X-CSRF-Token. */
export function requireCsrfWhenCookies(req, res, next) {
  const method = String(req.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();
  const hasRefresh = Boolean(req.cookies?.bk_refresh);
  const hasCsrf = Boolean(req.cookies?.[CSRF_COOKIE]);
  if (!hasRefresh && !hasCsrf) return next();
  if (!csrfTokensMatch(req)) {
    import('../../lib/requestMetrics.mjs')
      .then(({ observeSecurityEvent }) => observeSecurityEvent('csrf'))
      .catch(() => null);
    return res.status(403).json({ error: 'CSRF validation failed', code: 'CSRF_REJECTED' });
  }
  if (!originAllowed(req)) {
    return res.status(403).json({ error: 'Origin not allowed', code: 'ORIGIN_REJECTED' });
  }
  return next();
}

/**
 * Origin / Referer check for cookie-authenticated browser mutations.
 * Bearer-only APIs (no refresh cookie) skip this.
 */
export function originAllowed(req) {
  const hasRefresh = Boolean(req.cookies?.bk_refresh);
  if (!hasRefresh) return true;

  const allowed = String(process.env.CORS_ORIGIN || process.env.CORS_ALLOWED_ORIGINS || process.env.FRONTEND_URL || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowed.length === 0) {
    // Non-production without configured origins: allow (dev).
    return process.env.NODE_ENV !== 'production';
  }

  const origin = String(req.headers.origin || '');
  if (origin && allowed.includes(origin)) return true;

  const referer = String(req.headers.referer || '');
  if (referer) {
    try {
      const refOrigin = new URL(referer).origin;
      if (allowed.includes(refOrigin)) return true;
    } catch {
      /* ignore */
    }
  }

  // Same-origin requests may omit Origin; require at least one trusted signal in production.
  if (process.env.NODE_ENV === 'production' && !origin && !referer) {
    return false;
  }
  if (!origin && !referer) return true;
  return false;
}
