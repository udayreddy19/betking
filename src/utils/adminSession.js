const ADMIN_ROLES = new Set([
  'SUPER_ADMIN',
  'FINANCE_ADMIN',
  'TRADING_ADMIN',
  'SUPPORT_AGENT',
  'RISK_ANALYST',
  'MARKETING_ADMIN',
  'OPERATIONS_ADMIN',
]);

export function readAdminToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('adminToken');
}

export function decodeJwtPayload(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function getAdminSessionState(token = readAdminToken()) {
  if (!token) return { valid: false, reason: 'missing' };
  const payload = decodeJwtPayload(token);
  if (!payload) return { valid: false, reason: 'invalid' };
  if (payload.type === 'access' || payload.role === 'USER') {
    return { valid: false, reason: 'user', payload };
  }
  if (payload.type !== 'admin' || !ADMIN_ROLES.has(payload.role)) {
    return { valid: false, reason: 'forbidden', payload };
  }
  if (payload.exp && Date.now() / 1000 > payload.exp) {
    return { valid: false, reason: 'expired', payload };
  }
  return { valid: true, payload };
}

export function hasValidAdminSession() {
  return getAdminSessionState().valid;
}
