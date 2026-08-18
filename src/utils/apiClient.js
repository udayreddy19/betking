import { storageGet, storageSet, storageRemove } from './browserCompat.js';

const ACCESS_TOKEN_KEY = 'bk_access_token';

export function getAccessToken() {
  return storageGet(ACCESS_TOKEN_KEY, 'session');
}

export function setAccessToken(token) {
  if (token) storageSet(ACCESS_TOKEN_KEY, token, 'session');
  else storageRemove(ACCESS_TOKEN_KEY, 'session');
}

export function clearAccessToken() {
  storageRemove(ACCESS_TOKEN_KEY, 'session');
}

async function refreshAccessToken() {
  const res = await fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.accessToken) {
    setAccessToken(data.accessToken);
    return data.accessToken;
  }
  return null;
}

/**
 * Authenticated fetch with automatic token refresh on 401.
 */
export async function apiFetch(path, options = {}, { retry = true } = {}) {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const token = getAccessToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(path, {
    ...options,
    headers,
    credentials: options.credentials ?? 'include',
  });

  if (res.status === 401 && retry && token) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return apiFetch(path, options, { retry: false });
    }
  }

  return res;
}

export async function fetchMe() {
  const res = await apiFetch('/api/auth/me');
  if (!res.ok) return null;
  const data = await res.json();
  return data.user || null;
}

export function mapServerUserToSession(serverUser, previous = null) {
  if (!serverUser) return null;
  const balance = Number(serverUser.balance) || 0;
  const bonusBalance = Number(serverUser.bonusBalance) || 0;
  const freebetBalance = Number(serverUser.freebetBalance) || 0;
  const loyaltyPoints = Number(serverUser.loyaltyPoints) || 0;
  const reservedBalance = Number(serverUser.reservedBalance) || 0;
  const available = Math.max(0, balance - reservedBalance);
  return {
    ...(previous || {}),
    userId: serverUser.userId,
    email: serverUser.email,
    username: serverUser.email,
    displayName: serverUser.displayName || serverUser.firstName || serverUser.email?.split('@')[0],
    phone: serverUser.phone || previous?.phone || '',
    balance,
    reservedBalance,
    lockedDepositBalance: 0,
    winningsBalance: available,
    bonusBalance,
    freebetBalance,
    loyaltyLevel: previous?.loyaltyLevel ?? 1,
    loyaltyRank: previous?.loyaltyRank ?? 'Rookie',
    xpToNext: previous?.xpToNext ?? 1000,
    notifications: previous?.notifications ?? 0,
    loyaltyPoints,
    coins: loyaltyPoints,
    emailVerified: !!serverUser.emailVerified,
    role: serverUser.role || previous?.role || 'USER',
    kycStatus: serverUser.kycStatus,
    status: serverUser.status,
  };
}
