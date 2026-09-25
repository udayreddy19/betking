/**
 * One-time MFA pending challenge tokens.
 * Prevents reuse of an admin_mfa_pending JWT after successful verify/confirm.
 * In-process TTL map (5m mirrors pending JWT lifetime). Redis optional later.
 */
import crypto from 'crypto';

const CONSUMED = new Map(); // tokenHash -> expiresAtMs
const TTL_MS = 5 * 60 * 1000;

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function prune(now = Date.now()) {
  for (const [k, exp] of CONSUMED) {
    if (exp <= now) CONSUMED.delete(k);
  }
}

export function isAdminMfaPendingConsumed(token) {
  prune();
  const h = hashToken(token);
  const exp = CONSUMED.get(h);
  return Boolean(exp && exp > Date.now());
}

export function consumeAdminMfaPendingToken(token) {
  prune();
  const h = hashToken(token);
  CONSUMED.set(h, Date.now() + TTL_MS);
}

/** Test helper — clear consumed set. */
export function _resetAdminMfaPendingConsumedForTests() {
  CONSUMED.clear();
}
