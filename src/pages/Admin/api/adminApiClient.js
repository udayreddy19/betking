/**
 * Centralized API client for OddsYra Admin Operations Control Center
 * Manages admin authentication headers, correlation IDs, and standard error handling.
 */

const API_BASE = '/api/admin';

let sessionPromise = null;

/**
 * Ensure a valid admin JWT exists (dev bootstrap).
 * Production must disable /api/auth/admin-login unless ADMIN_DEV_LOGIN=1.
 * Skips re-login when a token already exists for the requested role.
 */
export async function ensureAdminSession(roleOverride) {
  const existing = localStorage.getItem('adminToken');
  const currentRole = localStorage.getItem('adminRole') || 'SUPER_ADMIN';
  const desiredRole = roleOverride || currentRole || 'SUPER_ADMIN';

  if (existing && (!roleOverride || currentRole === desiredRole)) {
    return existing;
  }

  if (!sessionPromise) {
    sessionPromise = (async () => {
      const res = await fetch('/api/auth/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: desiredRole, adminId: 'admin_local' }),
      });
      if (!res.ok) {
        throw new Error(`Admin session bootstrap failed (${res.status})`);
      }
      const data = await res.json();
      if (!data?.token) throw new Error('Admin session missing token');
      localStorage.setItem('adminToken', data.token);
      if (data.role) localStorage.setItem('adminRole', data.role);
      else localStorage.setItem('adminRole', desiredRole);
      return data.token;
    })().finally(() => {
      sessionPromise = null;
    });
  }

  return sessionPromise;
}

async function request(endpoint, options = {}) {
  let token = localStorage.getItem('adminToken') || localStorage.getItem('oddsyra_token');
  if (!token) {
    try {
      token = await ensureAdminSession();
    } catch {
      // fall through — server will 401 if required
    }
  }

  const headers = {
    'Content-Type': 'application/json',
    'X-Correlation-ID': `adm-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    ...options.headers,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401 && !options._retried) {
    try {
      // Force a fresh token on 401
      localStorage.removeItem('adminToken');
      await ensureAdminSession(localStorage.getItem('adminRole') || 'SUPER_ADMIN');
      return request(endpoint, { ...options, _retried: true });
    } catch {
      // continue to throw below
    }
  }

  if (!response.ok) {
    let errorData = {};
    try {
      errorData = await response.json();
    } catch {
      errorData = { message: response.statusText || 'API Request failed' };
    }
    const error = new Error(errorData.message || errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    error.status = response.status;
    error.data = errorData;
    throw error;
  }

  // Some admin endpoints may return 204
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export const adminApiClient = {
  get: (endpoint, options) => request(endpoint, { method: 'GET', ...options }),
  post: (endpoint, body, options) => request(endpoint, { method: 'POST', body: JSON.stringify(body ?? {}), ...options }),
  put: (endpoint, body, options) => request(endpoint, { method: 'PUT', body: JSON.stringify(body ?? {}), ...options }),
  patch: (endpoint, body, options) => request(endpoint, { method: 'PATCH', body: JSON.stringify(body ?? {}), ...options }),
  delete: (endpoint, options) => request(endpoint, { method: 'DELETE', ...options }),
};
