/**
 * Enterprise VIP Management Engine — BetKing Enterprise Platform (lib/vipEngine.mjs)
 * Manages VIP tiers (Bronze, Silver, Gold, Platinum, Diamond), cashback rewards,
 * priority customer support routing, and custom deposit limits.
 */

const VIP_USER_TIERS = new Map();

export function evaluateUserVipTier(userId, totalTurnover = 0) {
  let tier = 'BRONZE';
  if (totalTurnover >= 10000000) tier = 'DIAMOND';
  else if (totalTurnover >= 2500000) tier = 'PLATINUM';
  else if (totalTurnover >= 500000) tier = 'GOLD';
  else if (totalTurnover >= 100000) tier = 'SILVER';

  const record = {
    userId,
    tier,
    cashbackRatePct: tier === 'DIAMOND' ? 10 : tier === 'PLATINUM' ? 7.5 : tier === 'GOLD' ? 5 : 2,
    prioritySupport: ['PLATINUM', 'DIAMOND'].includes(tier),
    updatedAt: new Date().toISOString(),
  };

  VIP_USER_TIERS.set(userId, record);
  return record;
}
