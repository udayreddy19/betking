/**
 * Explicit deposit / payment status state machine.
 * Illegal transitions are rejected — never trust client-reported status.
 *
 * Happy path: CREATED → PENDING → SUCCESS → CREDITED
 * Alternatives: PENDING → FAILED | EXPIRED
 *              SUCCESS → REFUNDED | DISPUTED
 *              CREDITED → REFUNDED (partial/full after credit)
 */

export const PAYMENT_STATUSES = Object.freeze([
  'CREATED',
  'PENDING',
  'SUCCESS',
  'CREDITED',
  'FAILED',
  'EXPIRED',
  'REFUNDED',
  'DISPUTED',
  'CANCELLED',
]);

export const PAYMENT_ALLOWED_TRANSITIONS = Object.freeze({
  CREATED: ['PENDING', 'SUCCESS', 'FAILED', 'EXPIRED', 'CANCELLED'],
  PENDING: ['SUCCESS', 'FAILED', 'EXPIRED', 'CANCELLED'],
  SUCCESS: ['CREDITED', 'REFUNDED', 'DISPUTED'],
  CREDITED: ['REFUNDED', 'DISPUTED'],
  FAILED: [],
  EXPIRED: [],
  CANCELLED: [],
  REFUNDED: [],
  DISPUTED: ['REFUNDED'],
});

export function normalizePaymentStatus(raw) {
  const s = String(raw || '').toUpperCase().trim();
  if (s === 'PAID' || s === 'CAPTURED') return 'SUCCESS';
  if (s === 'USER_DROPPED') return 'CANCELLED';
  return PAYMENT_STATUSES.includes(s) ? s : null;
}

/**
 * @returns {{ ok: true, from, to } | never}
 * @throws with code ILLEGAL_PAYMENT_TRANSITION
 */
export function assertPaymentTransition(fromStatus, toStatus) {
  const from = normalizePaymentStatus(fromStatus) || String(fromStatus || '').toUpperCase();
  const to = normalizePaymentStatus(toStatus) || String(toStatus || '').toUpperCase();
  if (from === to) {
    return { ok: true, from, to, noop: true };
  }
  const allowed = PAYMENT_ALLOWED_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw Object.assign(
      new Error(`ILLEGAL_PAYMENT_TRANSITION: ${from} → ${to}`),
      { code: 'ILLEGAL_PAYMENT_TRANSITION', from, to, allowed: allowed || [] },
    );
  }
  return { ok: true, from, to, noop: false };
}

export function canTransitionPayment(fromStatus, toStatus) {
  try {
    assertPaymentTransition(fromStatus, toStatus);
    return true;
  } catch {
    return false;
  }
}
