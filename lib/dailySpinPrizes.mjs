/** Shared daily-spin prize table — server RNG is authoritative.
 * Bonus amounts: ₹100 / ₹200 / ₹500 / ₹750 only.
 * XP: 500 / 1,000 with two sectors each for more XP odds.
 */
export const SPIN_PRIZE_TTL_MS = 24 * 60 * 60 * 1000;
export const SPIN_PRIZE_TTL_HOURS = 24;

export const DAILY_SPIN_PRIZES = [
  { index: 0, amount: '₹100', subtitle: 'BONUS', type: 'bonus', value: 100, color: '#4c1d95' },
  { index: 1, amount: '₹200', subtitle: 'BONUS', type: 'bonus', value: 200, color: '#5b21b6' },
  { index: 2, amount: '500 XP', subtitle: 'BOOST', type: 'xp', value: 500, color: '#d97706' },
  { index: 3, amount: '₹500', subtitle: 'BONUS', type: 'bonus', value: 500, color: '#6d28d9' },
  { index: 4, amount: '₹750', subtitle: 'BONUS', type: 'bonus', value: 750, color: '#7c3aed' },
  { index: 5, amount: '1,000 XP', subtitle: 'BOOST', type: 'xp', value: 1000, color: '#b45309' },
  { index: 6, amount: '500 XP', subtitle: 'BOOST', type: 'xp', value: 500, color: '#d97706' },
  { index: 7, amount: '1,000 XP', subtitle: 'BOOST', type: 'xp', value: 1000, color: '#b45309' },
];

export const DAILY_SPIN_BONUS_AMOUNTS = Object.freeze([100, 200, 500, 750]);
export const DAILY_SPIN_XP_AMOUNTS = Object.freeze([500, 1000]);

export function spinDateInKolkata(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export { loyaltyTierFromPoints } from './vipBenefits.mjs';
