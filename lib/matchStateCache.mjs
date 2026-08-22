/**
 * Redis-backed canonical match state for settlement hydration (AUD-017).
 * Provider ticker membership is not required — last known valid state is retained.
 */

import { redis } from '../db/redis.js';
import { matchIdAliases } from './matchIdPublic.mjs';

const KEY_PREFIX = 'canonical:match:';
const META_PREFIX = 'canonical:match:meta:';
const DEFAULT_TTL_SEC = 86400; // 24h live; completed matches shorter
const COMPLETED_TTL_SEC = 3600;

function stateKey(matchId) {
  return `${KEY_PREFIX}${String(matchId)}`;
}

function metaKey(matchId) {
  return `${META_PREFIX}${String(matchId)}`;
}

export async function cacheCanonicalMatchState(matchId, state, { completed = false } = {}) {
  const id = String(matchId || state?.id || state?.matchId || '').trim();
  if (!id || !state) return false;

  const ttl = completed ? COMPLETED_TTL_SEC : DEFAULT_TTL_SEC;
  const payload = {
    ...state,
    id: state.id || id,
    matchId: state.matchId || id,
    cachedAt: new Date().toISOString(),
  };

  try {
    const pipe = redis.pipeline();
    for (const alias of [id, ...matchIdAliases(id)]) {
      pipe.set(stateKey(alias), JSON.stringify(payload), 'EX', ttl);
      pipe.hset(metaKey(alias), {
        providerFreshness: state.providerTimestamp || Date.now(),
        stateVersion: String(state.stateVersion ?? 0),
        status: String(state.status || state.matchState || 'LIVE'),
        updatedAt: payload.cachedAt,
      });
      pipe.expire(metaKey(alias), ttl);
    }
    await pipe.exec();
    return true;
  } catch (err) {
    if (process.env.DEBUG_REDIS) {
      console.warn('[matchStateCache] write failed', id, err.message);
    }
    return false;
  }
}

export async function getCachedCanonicalMatchState(matchId) {
  const id = String(matchId || '').trim();
  if (!id) return null;

  try {
    for (const alias of [id, ...matchIdAliases(id)]) {
      const raw = await redis.get(stateKey(alias));
      if (raw) return JSON.parse(raw);
    }
  } catch {
    return null;
  }
  return null;
}

export async function getMatchStateCacheMeta(matchId) {
  const id = String(matchId || '').trim();
  if (!id) return null;
  try {
    for (const alias of [id, ...matchIdAliases(id)]) {
      const meta = await redis.hgetall(metaKey(alias));
      if (meta && Object.keys(meta).length) return meta;
    }
  } catch {
    return null;
  }
  return null;
}
