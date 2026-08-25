/** Welcome signup codes — only one may be claimed per user / identity. */
export const EXCLUSIVE_SIGNUP_PROMO_CODES = Object.freeze(['SPORTS500', 'VIP1000', 'LIVE100']);

export function normalizeExclusivePromoCode(raw) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '');
}

export function isExclusiveSignupPromo(code) {
  return EXCLUSIVE_SIGNUP_PROMO_CODES.includes(normalizeExclusivePromoCode(code));
}

/** Returns the exclusive code already claimed, or null. */
export function findClaimedExclusiveSignupPromo(claimedCodes = []) {
  for (const code of claimedCodes) {
    const normalized = normalizeExclusivePromoCode(code);
    if (EXCLUSIVE_SIGNUP_PROMO_CODES.includes(normalized)) return normalized;
  }
  return null;
}

/**
 * True when this exclusive promo should be treated as unavailable
 * because another welcome code (or the same one) was already claimed.
 */
export function isExclusiveSignupPromoLocked(code, claimedCodes = []) {
  if (!isExclusiveSignupPromo(code)) return false;
  return Boolean(findClaimedExclusiveSignupPromo(claimedCodes));
}
