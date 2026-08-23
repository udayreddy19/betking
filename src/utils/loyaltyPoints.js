/** Loyalty: standard 2 pts / ₹100, VIP club 5 pts / ₹100; 5 points = ₹1; redeemable from 50 points */
import {
  LOYALTY_POINTS_PER_100_STANDARD,
  LOYALTY_POINTS_PER_100_SILVER,
  LOYALTY_POINTS_PER_100_GOLD,
  LOYALTY_POINTS_PER_100_VIP,
  LOYALTY_POINTS_PER_RUPEE,
  LOYALTY_MIN_REDEEM_POINTS,
  VIP_TIER_POINTS,
  getBenefitsForTier,
  isVipClubTier,
  pointsFromSpendAtTier,
  pointsPer100ForTier,
} from './vipBenefits';

const NEXT_TIER_THRESHOLDS = [
  ['SILVER', VIP_TIER_POINTS.SILVER],
  ['GOLD', VIP_TIER_POINTS.GOLD],
  ['PLATINUM', VIP_TIER_POINTS.PLATINUM],
  ['DIAMOND', VIP_TIER_POINTS.DIAMOND],
];

export {
  LOYALTY_POINTS_PER_100_STANDARD,
  LOYALTY_POINTS_PER_100_SILVER,
  LOYALTY_POINTS_PER_100_GOLD,
  LOYALTY_POINTS_PER_100_VIP,
  LOYALTY_POINTS_PER_RUPEE,
  LOYALTY_MIN_REDEEM_POINTS,
};
export const LOYALTY_POINTS_PER_100 = LOYALTY_POINTS_PER_100_VIP;

export function getUserLoyaltyPoints(user) {
  return Number(user?.loyaltyPoints ?? user?.coins ?? 0);
}

/** Lifetime VIP progression — not reduced when loyalty points are redeemed. */
export function getUserVipPoints(user) {
  return Number(user?.vipPoints ?? user?.loyaltyPoints ?? user?.coins ?? 0);
}

export function getUserLoyaltyTier(user) {
  return getBenefitsForTier(user?.loyaltyTier || user?.loyaltyRank).tier;
}

export function pointsFromSpend(amountRupees, userOrTier) {
  const tier = typeof userOrTier === 'string' || !userOrTier
    ? userOrTier
    : (userOrTier.loyaltyTier || userOrTier.loyaltyRank);
  return pointsFromSpendAtTier(amountRupees, tier);
}

export function pointsToRupees(points) {
  return (Number(points) || 0) / LOYALTY_POINTS_PER_RUPEE;
}

export function canRedeemLoyaltyPoints(points) {
  return (Number(points) || 0) >= LOYALTY_MIN_REDEEM_POINTS;
}

export function getPointsToNextTier(user) {
  const points = Number(getUserVipPoints(user)) || 0;
  const next = NEXT_TIER_THRESHOLDS.find(([, threshold]) => points < threshold);
  if (!next) {
    return { pointsToNext: 0, nextTier: null, nextLabel: null };
  }
  return {
    pointsToNext: next[1] - points,
    nextTier: next[0],
    nextLabel: getBenefitsForTier(next[0]).label,
  };
}

export function getLoyaltySummary(user) {
  const points = getUserLoyaltyPoints(user);
  const vipPoints = getUserVipPoints(user);
  const benefits = getBenefitsForTier(user?.loyaltyTier || user?.loyaltyRank);
  const redeemValue = pointsToRupees(points);
  const canRedeem = canRedeemLoyaltyPoints(points);
  const progress = Math.min(100, (points / LOYALTY_MIN_REDEEM_POINTS) * 100);
  const pointsToUnlock = Math.max(0, LOYALTY_MIN_REDEEM_POINTS - points);
  const nextTier = getPointsToNextTier(user);

  return {
    points,
    vipPoints,
    redeemValue,
    canRedeem,
    progress,
    pointsToUnlock,
    minRedeem: LOYALTY_MIN_REDEEM_POINTS,
    tier: benefits.tier,
    tierLabel: benefits.label,
    isVip: isVipClubTier(benefits.tier),
    pointsPer100: pointsPer100ForTier(benefits.tier),
    benefits,
    ...nextTier,
  };
}
