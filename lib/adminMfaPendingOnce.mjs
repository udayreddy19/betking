/**
 * One-time MFA pending challenge tokens (multi-instance safe).
 *
 * - Shared Redis SET NX EX when Redis is healthy (preferred always).
 * - MULTI_INSTANCE=true | NODE_ENV=production → Redis REQUIRED; no memory fallback.
 * - Single-instance / unit tests may use in-process Map only when Redis is unavailable.
 */
import crypto from 'crypto';

const CONSUMED = new Map(); // tokenHash -> expiresAtMs
const TTL_SEC = 5 * 60;
const TTL_MS = TTL_SEC * 1000;
const KEY_PREFIX = 'admin_mfa_pending_used:';

export function isMultiInstanceMode(env = process.env) {
  const flag = String(env.MULTI_INSTANCE || '').toLowerCase();
  if (flag === '1' || flag === 'true' || flag === 'yes') return true;
  if (env.NODE_ENV === 'production') return true;
  return false;
}

export class MfaInfraUnavailableError extends Error {
  constructor(message = 'MFA consume store unavailable (Redis required in multi-instance mode)') {
    super(message);
    this.name = 'MfaInfraUnavailableError';
    this.code = 'MFA_INFRA_UNAVAILABLE';
    this.status = 503;
  }
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function prune(now = Date.now()) {
  for (const [k, exp] of CONSUMED) {
    if (exp <= now) CONSUMED.delete(k);
  }
}

function memoryIsConsumed(hash) {
  prune();
  const exp = CONSUMED.get(hash);
  return Boolean(exp && exp > Date.now());
}

function memoryTryConsume(hash) {
  prune();
  if (memoryIsConsumed(hash)) return false;
  CONSUMED.set(hash, Date.now() + TTL_MS);
  return true;
}

async function getRedisClient() {
  try {
    const { redis, checkRedisHealth } = await import('../db/redis.js');
    const health = await checkRedisHealth();
    if (!health?.ok) return null;
    // Reject mock redis in multi-instance — it is not shared across processes
    if (isMultiInstanceMode() && health.status === 'mock_connected') return null;
    return redis;
  } catch {
    return null;
  }
}

/**
 * @returns {Promise<boolean>} true if token was already consumed
 */
export async function isAdminMfaPendingConsumed(token) {
  const hash = hashToken(token);
  const redis = await getRedisClient();
  if (redis) {
    try {
      const v = await redis.get(`${KEY_PREFIX}${hash}`);
      if (v) return true;
      return false;
    } catch (err) {
      if (isMultiInstanceMode()) throw new MfaInfraUnavailableError(err.message);
    }
  }
  if (isMultiInstanceMode()) {
    throw new MfaInfraUnavailableError();
  }
  return memoryIsConsumed(hash);
}

/**
 * Atomically mark pending MFA token as consumed.
 * @returns {Promise<boolean>} true if THIS caller consumed it; false if already used
 */
export async function tryConsumeAdminMfaPendingToken(token) {
  const hash = hashToken(token);
  const key = `${KEY_PREFIX}${hash}`;
  const redis = await getRedisClient();
  if (redis) {
    try {
      const result = await redis.set(key, '1', 'EX', TTL_SEC, 'NX');
      if (result === 'OK') {
        memoryTryConsume(hash);
        return true;
      }
      if (result === null) return false;
    } catch (err) {
      if (isMultiInstanceMode()) throw new MfaInfraUnavailableError(err.message);
    }
  }
  if (isMultiInstanceMode()) {
    throw new MfaInfraUnavailableError();
  }
  return memoryTryConsume(hash);
}

/** @deprecated Prefer tryConsumeAdminMfaPendingToken */
export async function consumeAdminMfaPendingToken(token) {
  await tryConsumeAdminMfaPendingToken(token);
}

export function isAdminMfaPendingConsumedSync(token) {
  return memoryIsConsumed(hashToken(token));
}

export function consumeAdminMfaPendingTokenSync(token) {
  return memoryTryConsume(hashToken(token));
}

export function _resetAdminMfaPendingConsumedForTests() {
  CONSUMED.clear();
}

export async function _resetAdminMfaPendingRedisForTests(token) {
  const hash = hashToken(token);
  CONSUMED.delete(hash);
  try {
    const redis = await getRedisClient();
    if (redis) await redis.del(`${KEY_PREFIX}${hash}`);
  } catch { /* ignore */ }
}

export const MFA_PENDING_KEY_PREFIX = KEY_PREFIX;
export const MFA_PENDING_TTL_SEC = TTL_SEC;
