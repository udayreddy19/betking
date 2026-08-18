/**
 * Centralized API client for OddsYra Admin Operations Control Center
 * Manages admin authentication headers, correlation IDs, and standard error handling.
 */

import { getAccessToken } from '../../../utils/apiClient';

const API_BASE = '/api/admin';

let sessionPromise = null;

function storeAdminSession(data, desiredRole) {
  if (!data?.token) throw new Error('Admin session missing token');
  localStorage.setItem('adminToken', data.token);
  localStorage.setItem('adminRole', data.role || desiredRole || 'SUPER_ADMIN');
  return data.token;
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
  if (!res.ok) {
    const error = new Error(data.error || `Admin session bootstrap failed (${res.status})`);
    error.status = res.status;
    error.code = data.code;
    throw error;
  }
  return data;
}

const IS_PROD_CLIENT = import.meta.env.PROD;

/**
 * Ensure a valid admin JWT exists.
 * Dev can bootstrap without a password. Production requires an admin account.
 */
export async function ensureAdminSession(roleOverride, credentials) {
  const existing = localStorage.getItem('adminToken');
  const currentRole = localStorage.getItem('adminRole') || 'SUPER_ADMIN';
  const desiredRole = roleOverride || currentRole || 'SUPER_ADMIN';

  if (existing && !credentials && (!roleOverride || currentRole === desiredRole)) {
    return existing;
  }

  if (credentials?.email && credentials?.password) {
    const data = await requestAdminLogin({
      role: desiredRole,
      email: credentials.email,
      password: credentials.password,
    });
    return storeAdminSession(data, desiredRole);
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
