/** Loyalty: standard 2 pts / ₹100, VIP club 5 pts / ₹100; 5 points = ₹1; redeemable from 50 points */
import {
  LOYALTY_POINTS_PER_100_STANDARD,
  LOYALTY_POINTS_PER_100_VIP,
  LOYALTY_POINTS_PER_RUPEE,
  LOYALTY_MIN_REDEEM_POINTS,
  getBenefitsForTier,
  isVipClubTier,
  pointsFromSpendAtTier,
  pointsPer100ForTier,
} from './vipBenefits';

export {
  LOYALTY_POINTS_PER_100_STANDARD,
  LOYALTY_POINTS_PER_100_VIP,
  LOYALTY_POINTS_PER_RUPEE,
  LOYALTY_MIN_REDEEM_POINTS,
};
export const LOYALTY_POINTS_PER_100 = LOYALTY_POINTS_PER_100_VIP;

export function getUserLoyaltyPoints(user) {
  return user?.loyaltyPoints ?? user?.coins ?? 0;
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

export function getLoyaltySummary(user) {
  const points = getUserLoyaltyPoints(user);
  const benefits = getBenefitsForTier(user?.loyaltyTier || user?.loyaltyRank);
  const redeemValue = pointsToRupees(points);
  const canRedeem = canRedeemLoyaltyPoints(points);
  const progress = Math.min(100, (points / LOYALTY_MIN_REDEEM_POINTS) * 100);
  const pointsToUnlock = Math.max(0, LOYALTY_MIN_REDEEM_POINTS - points);

  return {
    points,
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
  };
}
