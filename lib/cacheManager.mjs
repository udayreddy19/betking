/**
 * Enterprise Cache Manager — BetKing Sportsbook (lib/cacheManager.mjs)
 * Unified caching for matches, odds, commentary, markets, analytics, leaderboards,
 * provider feeds, and user profiles with automatic invalidation.
 */

const CENTRAL_CACHE = new Map();

export function getMatchCacheKey(matchId, namespace = 'state') {
  return `match:${matchId}:${namespace}`;
}

export function setMatchCacheItem(matchId, namespace, data, ttlSeconds = 10) {
  const key = getMatchCacheKey(matchId, namespace);
  return setCacheItem(key, data, ttlSeconds);
}

export function getMatchCacheItem(matchId, namespace) {
  const key = getMatchCacheKey(matchId, namespace);
  return getCacheItem(key);
}

export function invalidateMatchCache(matchId) {
  return invalidateCacheItem(`match:${matchId}`);
}

export function setCacheItem(key, data, ttlSeconds = 10) {
  const expiresAt = Date.now() + ttlSeconds * 1000;
  CENTRAL_CACHE.set(key, { data, expiresAt });
  return true;
}

export function getCacheItem(key) {
  const item = CENTRAL_CACHE.get(key);
  if (!item) return null;

  if (Date.now() > item.expiresAt) {
    CENTRAL_CACHE.delete(key);
    return null;
  }

  return item.data;
}

export function invalidateCacheItem(keyPattern) {
  let count = 0;
  for (const key of CENTRAL_CACHE.keys()) {
    if (key.includes(keyPattern)) {
      CENTRAL_CACHE.delete(key);
      count++;
    }
  }
  return count;
}
