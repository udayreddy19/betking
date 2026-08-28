/**
 * Redis Live Odds Snapshot Caching & PubSub Engine
 * 
 * Provides sub-millisecond caching of live match market books.
 * Falls back transparently to in-memory cache if Redis is unavailable.
 */

const LOCAL_MEMORY_CACHE = new Map();
const DEFAULT_TTL_SECONDS = 15;

async function getRedisClient() {
  try {
    const { getRedisClient: getClient } = await import('./redis.js');
    return getClient ? getClient() : null;
  } catch {
    return null;
  }
}

/**
 * Save an odds snapshot to cache
 * @param {string} matchId
 * @param {object} snapshot
 * @param {number} ttlSeconds
 */
export async function cacheOddsSnapshot(matchId, snapshot, ttlSeconds = DEFAULT_TTL_SECONDS) {
  if (!matchId || !snapshot) return;

  const serialized = JSON.stringify(snapshot);
  LOCAL_MEMORY_CACHE.set(matchId, {
    data: snapshot,
    expiresAt: Date.now() + (ttlSeconds * 1000),
  });

  try {
    const redis = await getRedisClient();
    if (redis && redis.status === 'ready') {
      await redis.setex(`odds:snapshot:${matchId}`, ttlSeconds, serialized);
    }
  } catch (ignored) {}
}

/**
 * Retrieve cached odds snapshot
 * @param {string} matchId
 * @returns {Promise<object|null>}
 */
export async function getCachedOddsSnapshot(matchId) {
  if (!matchId) return null;

  // Try Redis first
  try {
    const redis = await getRedisClient();
    if (redis && redis.status === 'ready') {
      const val = await redis.get(`odds:snapshot:${matchId}`);
      if (val) return JSON.parse(val);
    }
  } catch (ignored) {}

  // Fallback to in-memory cache
  const local = LOCAL_MEMORY_CACHE.get(matchId);
  if (local && local.expiresAt > Date.now()) {
    return local.data;
  }

  return null;
}

/**
 * Invalidate cache for a match (e.g. upon settlement or manual market update)
 */
export async function invalidateOddsCache(matchId) {
  LOCAL_MEMORY_CACHE.delete(matchId);
  try {
    const redis = await getRedisClient();
    if (redis && redis.status === 'ready') {
      await redis.del(`odds:snapshot:${matchId}`);
    }
  } catch (ignored) {}
}
