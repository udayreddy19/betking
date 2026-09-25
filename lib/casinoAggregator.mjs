/**
 * Casino AGGREGATOR hardening — not a house casino engine.
 *
 * Provides:
 *  - provider registry metadata
 *  - launch session tracking
 *  - callback verification + transaction idempotency hooks
 *
 * Wallet credits/debits from providers MUST go through verified callbacks only.
 */

import crypto from 'crypto';
import { createLogger } from './logger.mjs';
import { timingSafeEqualStrings } from './cryptoUtils.mjs';

const log = createLogger({ engine: 'casinoAggregator' });

export const CASINO_SCOPE = 'CASINO_AGGREGATOR';

const PROVIDERS = new Map([
  ['spribe', { id: 'spribe', name: 'Spribe', enabled: true, health: 'UNKNOWN' }],
  ['pragmatic', { id: 'pragmatic', name: 'Pragmatic Play', enabled: true, health: 'UNKNOWN' }],
  ['evolution', { id: 'evolution', name: 'Evolution', enabled: true, health: 'UNKNOWN' }],
]);

/** sessionId → session */
const sessions = new Map();
/** providerTxnId → internal result (idempotency) */
const txnLedger = new Map();

export function listCasinoProviders() {
  return Array.from(PROVIDERS.values());
}

export function createCasinoSession({
  userId,
  gameId,
  providerId = 'unknown',
  launchUrl = null,
} = {}) {
  if (!userId || !gameId) {
    throw Object.assign(new Error('CASINO_SESSION_INVALID: userId and gameId required'), {
      code: 'CASINO_SESSION_INVALID',
    });
  }
  const sessionId = `cs_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const session = Object.freeze({
    sessionId,
    userId: String(userId),
    gameId: String(gameId),
    providerId: String(providerId),
    launchUrl,
    status: 'OPEN',
    createdAt: new Date().toISOString(),
    scope: CASINO_SCOPE,
  });
  sessions.set(sessionId, { ...session });
  log.info('casino_session_created', { sessionId, userId, gameId, providerId });
  return session;
}

export function getCasinoSession(sessionId) {
  return sessions.get(String(sessionId)) || null;
}

export function closeCasinoSession(sessionId, reason = 'CLOSED') {
  const s = sessions.get(String(sessionId));
  if (!s) return null;
  s.status = 'CLOSED';
  s.closedAt = new Date().toISOString();
  s.closeReason = reason;
  return { ...s };
}

/**
 * Verify provider callback HMAC (shared-secret style).
 * Expects headers['x-casino-signature'] = hex HMAC-SHA256(rawBody, secret).
 */
export function verifyCasinoCallbackSignature({ rawBody, signature, secret } = {}) {
  const sec = secret || process.env.CASINO_CALLBACK_SECRET;
  if (!sec) {
    if (process.env.NODE_ENV === 'test') return true;
    return false;
  }
  if (!signature) return false;
  const raw = Buffer.isBuffer(rawBody)
    ? rawBody
    : Buffer.from(typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody || ''), 'utf8');
  const expected = crypto.createHmac('sha256', sec).update(raw).digest('hex');
  return timingSafeEqualStrings(expected, String(signature));
}

/**
 * Idempotent casino wallet transaction bridge.
 * Does NOT credit wallets itself — returns a validated intent for depositEngine/wallet layer.
 */
export function processCasinoCallbackTransaction({
  providerId,
  providerTxnId,
  sessionId,
  userId,
  type, // BET | WIN | REFUND | ROLLBACK
  amount,
  currency = 'INR',
  rawBody,
  signature,
} = {}) {
  if (!verifyCasinoCallbackSignature({ rawBody, signature })) {
    return { success: false, code: 'INVALID_SIGNATURE' };
  }

  const txnKey = `${providerId}:${providerTxnId}`;
  if (!providerTxnId) {
    return { success: false, code: 'MISSING_PROVIDER_TXN_ID' };
  }
  if (txnLedger.has(txnKey)) {
    return {
      success: true,
      code: 'IGNORED_DUPLICATE',
      result: txnLedger.get(txnKey),
    };
  }

  const session = sessionId ? getCasinoSession(sessionId) : null;
  if (sessionId && (!session || session.userId !== String(userId))) {
    return { success: false, code: 'SESSION_MISMATCH' };
  }

  const amt = Number(amount);
  if (!['BET', 'WIN', 'REFUND', 'ROLLBACK'].includes(String(type || '').toUpperCase()) || !(amt >= 0)) {
    return { success: false, code: 'INVALID_TXN' };
  }

  const internalTxnId = `ctx_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const result = {
    success: true,
    code: 'ACCEPTED',
    scope: CASINO_SCOPE,
    internalTxnId,
    providerId,
    providerTxnId,
    sessionId: sessionId || null,
    userId: String(userId),
    type: String(type).toUpperCase(),
    amount: amt,
    currency,
    status: 'PENDING_LEDGER',
    note: 'Verified intent only — apply via atomic wallet/ledger path',
    createdAt: new Date().toISOString(),
  };
  txnLedger.set(txnKey, result);
  return result;
}

export function getCasinoAggregatorStatus() {
  return {
    scope: CASINO_SCOPE,
    houseCasinoEngine: false,
    providers: listCasinoProviders(),
    openSessions: [...sessions.values()].filter((s) => s.status === 'OPEN').length,
    recordedTxns: txnLedger.size,
    checkedAt: new Date().toISOString(),
  };
}

export function _resetCasinoAggregatorForTests() {
  sessions.clear();
  txnLedger.clear();
}
