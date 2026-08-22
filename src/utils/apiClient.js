import { storageGet, storageSet, storageRemove } from './browserCompat.js';
import { getPointsToNextTier } from './loyaltyPoints.js';

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

export function getCsrfToken() {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|; )bk_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : '';
}

function withCsrfHeaders(headers) {
  const csrf = getCsrfToken();
  if (csrf && !headers.has('X-CSRF-Token')) {
    headers.set('X-CSRF-Token', csrf);
  }
  return headers;
}

export async function refreshAccessToken() {
  const headers = withCsrfHeaders(new Headers({ 'Content-Type': 'application/json' }));
  const res = await fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'include',
    headers,
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
  const headers = withCsrfHeaders(new Headers(options.headers || {}));
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
  const winningsBalance = Number(serverUser.winningsBalance) || 0;
  const lockedDepositBalance = Number(serverUser.lockedDepositBalance) || 0;
  // Server is authoritative. Fallbacks must match wageringRules: reserved is audit-only.
  const availableBalance = Number(
    serverUser.availableBalance ?? Math.max(0, balance),
  ) || 0;
  const withdrawableBalance = Number(
    serverUser.withdrawableBalance ?? Math.max(0, balance - lockedDepositBalance),
  ) || 0;
  const loyaltyTier = serverUser.loyaltyTier || previous?.loyaltyTier || 'BRONZE';
  const nextTier = getPointsToNextTier({ loyaltyPoints, loyaltyTier });
  return {
    ...(previous || {}),
    userId: serverUser.userId,
    email: serverUser.email,
    username: serverUser.email,
    displayName: serverUser.displayName || serverUser.firstName || serverUser.email?.split('@')[0],
    phone: serverUser.phone || previous?.phone || '',
    balance,
    reservedBalance,
    lockedDepositBalance,
    winningsBalance,
    availableBalance,
    withdrawableBalance,
    pendingWithdrawal: Number(serverUser.pendingWithdrawal ?? reservedBalance) || 0,
    bonusBalance,
    freebetBalance,
    loyaltyPoints,
    coins: loyaltyPoints,
    loyaltyTier,
    loyaltyRank: loyaltyTier,
    loyaltyLevel: previous?.loyaltyLevel ?? 1,
    xpToNext: nextTier.pointsToNext,
    notifications: previous?.notifications ?? 0,
    emailVerified: !!serverUser.emailVerified,
    role: serverUser.role || previous?.role || 'USER',
    kycStatus: serverUser.kycStatus,
    status: serverUser.status,
  };
}
