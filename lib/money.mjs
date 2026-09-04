/**
 * Integer paise helpers for wallet-mutating money paths.
 * Store as NUMERIC rupees via fromPaise; compare/add in paise to avoid float drift.
 */

/** @param {number|string} inr @returns {number} integer paise */
export function toPaise(inr) {
  const n = Number(inr);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** @param {number|string} paise @returns {number} rupees (2dp) */
export function fromPaise(paise) {
  const n = Number(paise);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n) / 100;
}

/**
 * Sum integer paise values (already in minor units).
 * @param {...number} parts
 * @returns {number} integer paise
 */
export function addPaise(...parts) {
  let sum = 0;
  for (const p of parts) {
    const n = Number(p);
    sum += Number.isFinite(n) ? Math.round(n) : 0;
  }
  return sum;
}

/** Round INR to authoritative 2dp via paise. */
export function roundInr(inr) {
  return fromPaise(toPaise(inr));
}
