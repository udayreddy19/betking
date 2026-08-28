/**
 * VIP Loyalty Progression & Daily Retention Streak Engine
 * 
 * Accrues reward points per ₹100 turnover.
 * Tiers:
 *  - BRONZE:   0 - 999 pts (Base cashback 0.5%)
 *  - SILVER:   1,000 - 4,999 pts (Cashback 1.0%, +2.5% Cashout boost)
 *  - GOLD:     5,000 - 24,999 pts (Cashback 2.0%, +5% Cashout boost, Weekly Free Bet)
 *  - PLATINUM: 25,000 - 99,999 pts (Cashback 3.5%, +7.5% Cashout boost, Dedicated VIP Manager)
 *  - DIAMOND:  100,000+ pts (Cashback 5.0%, +10% Cashout boost, Instant Withdrawals)
 */

export const VIP_TIER_THRESHOLDS = [
  { tier: 'DIAMOND', minPoints: 100000, cashbackPct: 5.0, cashoutBoostPct: 10.0 },
  { tier: 'PLATINUM', minPoints: 25000, cashbackPct: 3.5, cashoutBoostPct: 7.5 },
  { tier: 'GOLD', minPoints: 5000, cashbackPct: 2.0, cashoutBoostPct: 5.0 },
  { tier: 'SILVER', minPoints: 1000, cashbackPct: 1.0, cashoutBoostPct: 2.5 },
  { tier: 'BRONZE', minPoints: 0, cashbackPct: 0.5, cashoutBoostPct: 0.0 },
];

export const POINTS_PER_100_WAGERED = 1.0;

/**
 * Calculate earned loyalty points from a bet turnover
 */
export function calculateEarnedPoints(stake = 0) {
  return Number(((Math.max(0, Number(stake) || 0) / 100) * POINTS_PER_100_WAGERED).toFixed(2));
}

/**
 * Resolve current tier from total lifetime points
 */
export function resolveVipTier(lifetimePoints = 0) {
  const pts = Number(lifetimePoints) || 0;
  const matched = VIP_TIER_THRESHOLDS.find((t) => pts >= t.minPoints) || VIP_TIER_THRESHOLDS[VIP_TIER_THRESHOLDS.length - 1];

  const currentIdx = VIP_TIER_THRESHOLDS.indexOf(matched);
  const nextTier = currentIdx > 0 ? VIP_TIER_THRESHOLDS[currentIdx - 1] : null;

  return {
    tier: matched.tier,
    points: pts,
    cashbackPct: matched.cashbackPct,
    cashoutBoostPct: matched.cashoutBoostPct,
    nextTier: nextTier ? nextTier.tier : null,
    pointsToNextTier: nextTier ? Math.max(0, nextTier.minPoints - pts) : 0,
    progressPct: nextTier ? Number(((pts / nextTier.minPoints) * 100).toFixed(1)) : 100.0,
  };
}

/**
 * Calculate user daily streak update
 * @param {number} currentStreak
 * @param {string|null} lastActivityDate ISO Date string (YYYY-MM-DD)
 */
export function calculateDailyStreak(currentStreak = 0, lastActivityDate = null) {
  const today = new Date().toISOString().slice(0, 10);
  if (!lastActivityDate) {
    return { streak: 1, lastActivityDate: today, milestoneBonusAwarded: false, bonusAmount: 0 };
  }

  const last = String(lastActivityDate).slice(0, 10);
  if (last === today) {
    // Already recorded today
    return { streak: currentStreak, lastActivityDate: today, milestoneBonusAwarded: false, bonusAmount: 0 };
  }

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  let newStreak = (last === yesterday) ? currentStreak + 1 : 1;

  // Milestone bonus on 7-day, 14-day, 30-day streaks
  let bonusAmount = 0;
  let milestoneBonusAwarded = false;

  if (newStreak === 7) {
    bonusAmount = 100;
    milestoneBonusAwarded = true;
  } else if (newStreak === 14) {
    bonusAmount = 250;
    milestoneBonusAwarded = true;
  } else if (newStreak === 30) {
    bonusAmount = 1000;
    milestoneBonusAwarded = true;
  }

  return {
    streak: newStreak,
    lastActivityDate: today,
    milestoneBonusAwarded,
    bonusAmount,
  };
}
