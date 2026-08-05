/** Loyalty: 5 points per ₹100 spent; 5 points = ₹1; redeemable from 50 points */
export const LOYALTY_POINTS_PER_100 = 5;
export const LOYALTY_POINTS_PER_RUPEE = 5;
export const LOYALTY_MIN_REDEEM_POINTS = 50;

export function getUserLoyaltyPoints(user) {
  return user?.loyaltyPoints ?? user?.coins ?? 0;
}

export function pointsFromSpend(amountRupees) {
  const amount = Number(amountRupees) || 0;
  if (amount <= 0) return 0;
  return Math.floor((amount / 100) * LOYALTY_POINTS_PER_100);
}

export function pointsToRupees(points) {
  return (Number(points) || 0) / LOYALTY_POINTS_PER_RUPEE;
}

export function canRedeemLoyaltyPoints(points) {
  return (Number(points) || 0) >= LOYALTY_MIN_REDEEM_POINTS;
}

export function getLoyaltySummary(user) {
  const points = getUserLoyaltyPoints(user);
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
  };
}
