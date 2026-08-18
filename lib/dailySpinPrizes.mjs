/** Shared daily-spin prize table — server RNG is authoritative. */
export const DAILY_SPIN_PRIZES = [
  { index: 0, amount: '₹500', subtitle: 'BONUS', type: 'bonus', value: 500, color: '#6d28d9' },
  { index: 1, amount: '₹200', subtitle: 'FREEBET', type: 'freebet', value: 200, color: '#0284c7' },
  { index: 2, amount: '500 XP', subtitle: 'BOOST', type: 'xp', value: 500, color: '#d97706' },
  { index: 3, amount: '₹1,000', subtitle: 'BONUS', type: 'bonus', value: 1000, color: '#7c3aed' },
  { index: 4, amount: '₹100', subtitle: 'FREEBET', type: 'freebet', value: 100, color: '#0369a1' },
  { index: 5, amount: '₹2,500', subtitle: 'MEGA BONUS', type: 'bonus', value: 2500, color: '#8b5cf6' },
  { index: 6, amount: '1,000 XP', subtitle: 'BOOST', type: 'xp', value: 1000, color: '#b45309' },
  { index: 7, amount: '₹500', subtitle: 'FREEBET', type: 'freebet', value: 500, color: '#1d4ed8' },
];

export function spinDateInKolkata(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function loyaltyTierFromPoints(points) {
  const pts = Number(points) || 0;
  if (pts >= 10000) return 'PLATINUM';
  if (pts >= 2000) return 'GOLD';
  if (pts >= 500) return 'SILVER';
  return 'BRONZE';
}
