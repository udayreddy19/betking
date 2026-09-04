/** Shared daily-spin prize table — server RNG is authoritative.
 * Wheel is bonus-only: ₹100 / ₹200 / ₹500 / ₹750 (two sectors each for even odds).
 */
export const SPIN_PRIZE_TTL_MS = 24 * 60 * 60 * 1000;
export const SPIN_PRIZE_TTL_HOURS = 24;

export const DAILY_SPIN_PRIZES = [
  { index: 0, amount: '₹100', subtitle: 'BONUS', type: 'bonus', value: 100, color: '#4c1d95' },
  { index: 1, amount: '₹200', subtitle: 'BONUS', type: 'bonus', value: 200, color: '#5b21b6' },
  { index: 2, amount: '₹500', subtitle: 'BONUS', type: 'bonus', value: 500, color: '#6d28d9' },
  { index: 3, amount: '₹750', subtitle: 'BONUS', type: 'bonus', value: 750, color: '#7c3aed' },
  { index: 4, amount: '₹100', subtitle: 'BONUS', type: 'bonus', value: 100, color: '#4c1d95' },
  { index: 5, amount: '₹200', subtitle: 'BONUS', type: 'bonus', value: 200, color: '#5b21b6' },
  { index: 6, amount: '₹500', subtitle: 'BONUS', type: 'bonus', value: 500, color: '#6d28d9' },
  { index: 7, amount: '₹750', subtitle: 'BONUS', type: 'bonus', value: 750, color: '#7c3aed' },
];

export const DAILY_SPIN_BONUS_AMOUNTS = Object.freeze([100, 200, 500, 750]);

export function spinDateInKolkata(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export { loyaltyTierFromPoints } from './vipBenefits.mjs';
