/**
 * Centralized API client for BetKing Admin Operations Control Center
 * Manages admin authentication headers, correlation IDs, and standard error handling.
 */

const API_BASE = '/api/admin';

async function request(endpoint, options = {}) {
  const token = localStorage.getItem('adminToken') || localStorage.getItem('betking_token');
  const headers = {
    'Content-Type': 'application/json',
    'X-Admin-Role': localStorage.getItem('adminRole') || 'SUPER_ADMIN',
    'X-Correlation-ID': `adm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorData = {};
    try {
      errorData = await response.json();
    } catch (e) {
      errorData = { message: response.statusText || 'API Request failed' };
    }
    const error = new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
    error.status = response.status;
    error.data = errorData;
    throw error;
  }

  return response.json();
}

export const adminApiClient = {
  get: (endpoint, options) => request(endpoint, { method: 'GET', ...options }),
  post: (endpoint, body, options) => request(endpoint, { method: 'POST', body: JSON.stringify(body), ...options }),
  put: (endpoint, body, options) => request(endpoint, { method: 'PUT', body: JSON.stringify(body), ...options }),
  delete: (endpoint, options) => request(endpoint, { method: 'DELETE', ...options }),
};
