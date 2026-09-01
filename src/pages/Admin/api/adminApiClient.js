/**
 * Centralized API client for OddsYra Admin Operations Control Center
 * Manages admin authentication headers, correlation IDs, and standard error handling.
 */

import { getAccessToken } from '../../../utils/apiClient';
import { getAdminSessionState } from '../../../utils/adminSession';

const API_BASE = '/api/admin';

let sessionPromise = null;
/** After a failed silent bootstrap, do not keep POSTing /admin-login (hits the 5/min limiter). */
let silentBootstrapBlocked = false;

function storeAdminSession(data, desiredRole) {
  if (!data?.token) throw new Error('Admin session missing token');
  silentBootstrapBlocked = false;
  localStorage.setItem('adminToken', data.token);
  localStorage.setItem('adminRole', data.role || desiredRole || 'SUPER_ADMIN');
  return data.token;
}

function throwAdminAuthError(res, data) {
  const error = new Error(data.error || `Admin session bootstrap failed (${res.status})`);
  error.status = res.status;
  error.code = data.code;
  error.mfaToken = data.mfaToken;
  error.secret = data.secret;
  error.otpauthUrl = data.otpauthUrl;
  throw error;
}

async function requestAdminLogin(body, userToken) {
  const headers = { 'Content-Type': 'application/json' };
  if (userToken) headers.Authorization = `Bearer ${userToken}`;
  const res = await fetch('/api/auth/admin-login', {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throwAdminAuthError(res, data);
  return data;
}

async function requestAdminMfa({ mfaToken, code, enroll }) {
  const path = enroll ? '/api/auth/admin-mfa/confirm' : '/api/auth/admin-mfa/verify';
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ mfaToken, code }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throwAdminAuthError(res, data);
  return data;
}

const IS_PROD_CLIENT = import.meta.env.PROD;

/**
 * Ensure a valid admin JWT exists.
 * Dev can bootstrap without a password. Production requires an admin account.
 */
export async function ensureAdminSession(roleOverride, credentials) {
  const existing = localStorage.getItem('adminToken');
  const session = getAdminSessionState(existing);
  const currentRole = session.valid
    ? session.payload.role
    : (localStorage.getItem('adminRole') || 'SUPER_ADMIN');
  const desiredRole = roleOverride || currentRole || 'SUPER_ADMIN';

  if (session.valid && !credentials && (!roleOverride || currentRole === desiredRole)) {
    if (localStorage.getItem('adminRole') !== currentRole) {
      localStorage.setItem('adminRole', currentRole);
    }
    return existing;
  }

  if (existing && !session.valid) {
    localStorage.removeItem('adminToken');
  }

  if (credentials?.totpCode && credentials?.mfaToken) {
    const data = await requestAdminMfa({
      mfaToken: credentials.mfaToken,
      code: credentials.totpCode,
      enroll: !!credentials.enroll,
    });
    return storeAdminSession(data, desiredRole);
  }

  if (credentials?.email && credentials?.password) {
    const data = await requestAdminLogin({
      role: desiredRole,
      email: credentials.email,
      password: credentials.password,
    });
    return storeAdminSession(data, desiredRole);
  }

  if (IS_PROD_CLIENT && silentBootstrapBlocked) {
    const err = new Error('Sign in with an admin account to continue.');
    err.code = 'ADMIN_LOGIN_REQUIRED';
    throw err;
  }

  if (!sessionPromise) {
    sessionPromise = (async () => {
      try {
        const userToken = getAccessToken();
        if (userToken) {
          const data = await requestAdminLogin({ role: desiredRole }, userToken);
          return storeAdminSession(data, desiredRole);
        }

        if (IS_PROD_CLIENT) {
          silentBootstrapBlocked = true;
          const err = new Error('Sign in with an admin account to continue.');
          err.code = 'ADMIN_LOGIN_REQUIRED';
          throw err;
        }

        const data = await requestAdminLogin(
          { role: desiredRole, adminId: 'admin_local' },
          null,
        );
        return storeAdminSession(data, desiredRole);
      } catch (err) {
        if (IS_PROD_CLIENT) silentBootstrapBlocked = true;
        if (existing && (err.code === 'ADMIN_LOGIN_REQUIRED' || err.code === 'ADMIN_LOGIN_DISABLED')) {
          return existing;
        }
        throw err;
      }
    })().finally(() => {
      sessionPromise = null;
    });
  }

  return sessionPromise;
}

async function request(endpoint, options = {}) {
  let token = localStorage.getItem('adminToken');
  if (token && !getAdminSessionState(token).valid) {
    localStorage.removeItem('adminToken');
    token = null;
  }
  if (!token && !IS_PROD_CLIENT) {
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
    credentials: 'include',
    headers,
  });

  const method = String(options.method || 'GET').toUpperCase();
  const transient = response.status === 502 || response.status === 503 || response.status === 504;
  const retrySafe = method === 'GET' || String(endpoint).includes('/db/query') || String(endpoint).includes('/db/tables');
  if (transient && retrySafe && !options._upstreamRetry) {
    await new Promise((resolve) => setTimeout(resolve, 700));
    return request(endpoint, { ...options, _upstreamRetry: true });
  }

  if (response.status === 401 && !options._retried) {
    localStorage.removeItem('adminToken');
    if (IS_PROD_CLIENT) {
      const error = new Error('Authentication required');
      error.status = 401;
      error.code = 'AUTH_REQUIRED';
      throw error;
    }
    try {
      // Dev-only: passwordless bootstrap after a stale token.
      token = await ensureAdminSession(localStorage.getItem('adminRole') || 'SUPER_ADMIN');
      if (!token) throw new Error('Admin session bootstrap failed');
      return request(endpoint, { ...options, _retried: true });
    } catch (err) {
      const error = new Error(err.message || 'Authentication required');
      error.status = 401;
      error.code = err.code || 'AUTH_REQUIRED';
      throw error;
    }
  }

  if (!response.ok) {
    let errorData = {};
    try {
      errorData = await response.json();
    } catch {
      errorData = {
        message: [502, 503, 504].includes(response.status)
          ? 'The API is briefly unavailable. Retry in a few seconds.'
          : ((response.statusText || '').trim() || `API request failed (HTTP ${response.status})`),
      };
    }
    const error = new Error(
      errorData.error
      || errorData.message
      || `HTTP ${response.status}${response.statusText ? `: ${response.statusText}` : ''}`,
    );
    error.status = response.status;
    error.code = errorData.code;
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
