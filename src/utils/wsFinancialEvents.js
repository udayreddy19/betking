/**
 * Financial WebSocket event helpers — dedupe + stale/out-of-order guards.
 * Wallet balances are still applied via REST refresh; these guards prevent
 * duplicate/stale handler storms and payload application races.
 */

const FINANCIAL_EVENT_TYPES = new Set([
  'BET_SETTLED',
  'WALLET_BALANCE_UPDATED',
  'BET_CASHED_OUT',
]);

export function isFinancialWsEventType(eventType) {
  return FINANCIAL_EVENT_TYPES.has(String(eventType || ''));
}

export function financialEventId(msg) {
  return msg?.payload?.eventId || msg?.eventId || null;
}

export function financialEventTimestamp(msg) {
  const raw = msg?.timestamp ?? msg?.payload?.timestamp ?? msg?.payload?.settledAt ?? 0;
  if (typeof raw === 'string') {
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return Number(raw) || 0;
}

/**
 * @param {object} msg
 * @param {Set<string>} seenSet
 * @param {{ current: number }} lastTsRef
 * @param {{ maxSeen?: number }} [opts]
 * @returns {{ apply: boolean, reason?: string }}
 */
export function shouldApplyFinancialWsEvent(msg, seenSet, lastTsRef, opts = {}) {
  const maxSeen = opts.maxSeen ?? 200;
  const id = financialEventId(msg);
  if (id) {
    if (seenSet.has(id)) {
      return { apply: false, reason: 'duplicate' };
    }
    seenSet.add(id);
    while (seenSet.size > maxSeen) {
      const oldest = seenSet.values().next().value;
      seenSet.delete(oldest);
    }
  }

  const ts = financialEventTimestamp(msg);
  if (ts > 0 && lastTsRef?.current > 0 && ts < lastTsRef.current) {
    return { apply: false, reason: 'stale' };
  }
  if (ts > 0 && lastTsRef) {
    lastTsRef.current = ts;
  }
  return { apply: true };
}

/**
 * Assert WS financial payloads never target a different user than the session.
 * @returns {boolean} true if event is safe to apply for sessionUserId
 */
export function isFinancialEventForUser(msg, sessionUserId) {
  if (!sessionUserId) return false;
  const payloadUserId = msg?.payload?.userId;
  if (payloadUserId == null || payloadUserId === '') return true;
  return String(payloadUserId) === String(sessionUserId);
}
