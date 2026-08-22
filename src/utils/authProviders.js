const CACHE_KEY = 'bk_auth_providers';
const CACHE_TTL_MS = 10 * 60 * 1000;

export function readCachedAuthProviders() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.data || Date.now() - parsed.at > CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function writeCachedAuthProviders(data) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
  } catch {
    // private mode / quota
  }
}

export async function fetchAuthProviders({ signal } = {}) {
  const res = await fetch('/api/auth/providers', {
    credentials: 'include',
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`providers_${res.status}`);
  }
  const data = await res.json();
  writeCachedAuthProviders(data);
  return data;
}

export function getInitialAuthProviders() {
  const cached = readCachedAuthProviders();
  if (cached && typeof cached.google === 'boolean') return cached;
  return { google: null };
}
