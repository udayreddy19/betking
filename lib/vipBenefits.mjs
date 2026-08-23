/**
 * VIP vs standard player benefits.
 * Normal (BRONZE): 2 loyalty points per ₹100 staked.
 * SILVER (Pre-VIP): 3 · GOLD: 4 · PLATINUM & DIAMOND: 5 per ₹100.
 */

export const LOYALTY_POINTS_PER_100_STANDARD = 2;
export const LOYALTY_POINTS_PER_100_SILVER = 3;
export const LOYALTY_POINTS_PER_100_GOLD = 4;
export const LOYALTY_POINTS_PER_100_VIP = 5;
export const LOYALTY_POINTS_PER_RUPEE = 5;
export const LOYALTY_MIN_REDEEM_POINTS = 50;

export const MIN_DEPOSIT_INR = 1000;
export const MIN_WITHDRAW_INR = 1000;
export const MAX_DEPOSIT_INR = 100000;

export const VIP_CLUB_TIERS = ['SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'];
export const FULL_VIP_TIERS = ['GOLD', 'PLATINUM', 'DIAMOND'];
export const VIP_TIER_ORDER = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'];

const TIER_BENEFITS = {
  BRONZE: {
    label: 'Standard',
    pointsPer100: LOYALTY_POINTS_PER_100_STANDARD,
    minDeposit: MIN_DEPOSIT_INR,
    minWithdraw: MIN_WITHDRAW_INR,
    maxWithdraw: 50000,
    cashbackPct: 0,
    maxDailyCashback: 0,
    cashoutPayoutPct: 0.85,
    oddsBoostPct: 0,
    spinMultiplier: 1,
    monthlyReward: null,
    tierUpReward: null,
    supportSlaMinutes: 15,
    withdrawReviewHours: 24,
    priorityWithdraw: false,
    prioritySupport: false,
    dedicatedManager: false,
    minRedeemPoints: LOYALTY_MIN_REDEEM_POINTS,
  },
  SILVER: {
    label: 'Pre-VIP',
    pointsPer100: LOYALTY_POINTS_PER_100_SILVER,
    minDeposit: MIN_DEPOSIT_INR,
    minWithdraw: MIN_WITHDRAW_INR,
    maxWithdraw: 100000,
    cashbackPct: 2,
    maxDailyCashback: 1000,
    cashoutPayoutPct: 0.88,
    oddsBoostPct: 0,
    spinMultiplier: 1,
    monthlyReward: { type: 'freebet', amount: 100 },
    tierUpReward: { type: 'freebet', amount: 200 },
    supportSlaMinutes: 10,
    withdrawReviewHours: 8,
    priorityWithdraw: true,
    prioritySupport: false,
    dedicatedManager: false,
    minRedeemPoints: LOYALTY_MIN_REDEEM_POINTS,
  },
  GOLD: {
    label: 'VIP Gold',
    pointsPer100: LOYALTY_POINTS_PER_100_GOLD,
    minDeposit: MIN_DEPOSIT_INR,
    minWithdraw: MIN_WITHDRAW_INR,
    maxWithdraw: 250000,
    cashbackPct: 5,
    maxDailyCashback: 2500,
    cashoutPayoutPct: 0.90,
    oddsBoostPct: 2,
    spinMultiplier: 1.25,
    monthlyReward: { type: 'bonus', amount: 250 },
    tierUpReward: { type: 'bonus', amount: 500 },
    supportSlaMinutes: 5,
    withdrawReviewHours: 4,
    priorityWithdraw: true,
    prioritySupport: true,
    dedicatedManager: false,
    minRedeemPoints: LOYALTY_MIN_REDEEM_POINTS,
  },
  PLATINUM: {
    label: 'VIP Platinum',
    pointsPer100: LOYALTY_POINTS_PER_100_VIP,
    minDeposit: MIN_DEPOSIT_INR,
    minWithdraw: MIN_WITHDRAW_INR,
    maxWithdraw: 500000,
    cashbackPct: 7.5,
    maxDailyCashback: 5000,
    cashoutPayoutPct: 0.92,
    oddsBoostPct: 3,
    spinMultiplier: 1.5,
    monthlyReward: { type: 'bonus', amount: 500 },
    tierUpReward: { type: 'bonus', amount: 1000 },
    supportSlaMinutes: 3,
    withdrawReviewHours: 2,
    priorityWithdraw: true,
    prioritySupport: true,
    dedicatedManager: true,
    minRedeemPoints: LOYALTY_MIN_REDEEM_POINTS,
  },
  DIAMOND: {
    label: 'VIP Diamond',
    pointsPer100: LOYALTY_POINTS_PER_100_VIP,
    minDeposit: MIN_DEPOSIT_INR,
    minWithdraw: MIN_WITHDRAW_INR,
    maxWithdraw: 1000000,
    cashbackPct: 10,
    maxDailyCashback: 10000,
    cashoutPayoutPct: 0.95,
    oddsBoostPct: 5,
    spinMultiplier: 2,
    monthlyReward: { type: 'cash', amount: 1000 },
    tierUpReward: { type: 'cash', amount: 2500 },
    supportSlaMinutes: 2,
    withdrawReviewHours: 1,
    priorityWithdraw: true,
    prioritySupport: true,
    dedicatedManager: true,
    minRedeemPoints: LOYALTY_MIN_REDEEM_POINTS,
  },
};

export const VIP_TIER_POINTS = {
  BRONZE: 0,
  SILVER: 2000,
  GOLD: 10000,
  PLATINUM: 25000,
  DIAMOND: 50000,
};

export function loyaltyTierFromPoints(points) {
  const pts = Number(points) || 0;
  if (pts >= VIP_TIER_POINTS.DIAMOND) return 'DIAMOND';
  if (pts >= VIP_TIER_POINTS.PLATINUM) return 'PLATINUM';
  if (pts >= VIP_TIER_POINTS.GOLD) return 'GOLD';
  if (pts >= VIP_TIER_POINTS.SILVER) return 'SILVER';
  return 'BRONZE';
}

export function normalizeVipTier(raw) {
  const tier = String(raw || 'BRONZE').trim().toUpperCase();
  if (TIER_BENEFITS[tier]) return tier;
  if (tier === 'ROOKIE' || tier === 'PRE-VIP' || tier === 'PREVIP') return 'BRONZE';
  return 'BRONZE';
}

export function isVipClubTier(tier) {
  return VIP_CLUB_TIERS.includes(normalizeVipTier(tier));
}

export function isFullVipTier(tier) {
  return FULL_VIP_TIERS.includes(normalizeVipTier(tier));
}

export function getBenefitsForTier(tier) {
  const key = normalizeVipTier(tier);
  return { tier: key, ...TIER_BENEFITS[key] };
}

export function pointsPer100ForTier(tier) {
  return getBenefitsForTier(tier).pointsPer100;
}

export function pointsFromSpendAtTier(amountRupees, tier) {
  const amount = Number(amountRupees) || 0;
  if (amount <= 0) return 0;
  return Math.floor((amount / 100) * pointsPer100ForTier(tier));
}

export function crossedVipTiers(fromTier, toTier) {
  const from = VIP_TIER_ORDER.indexOf(normalizeVipTier(fromTier));
  const to = VIP_TIER_ORDER.indexOf(normalizeVipTier(toTier));
  if (to <= from) return [];
  return VIP_TIER_ORDER.slice(from + 1, to + 1);
}

export function applyVipOddsBoost(odds, tierOrPct) {
  const boostPct = typeof tierOrPct === 'number'
    ? tierOrPct
    : getBenefitsForTier(tierOrPct).oddsBoostPct;
  const value = Number(odds) || 0;
  if (value <= 0 || !boostPct) return value;
  return Number((value * (1 + boostPct / 100)).toFixed(3));
}

export function cashoutAmountFromPotential(potentialPayout, tier) {
  const pct = getBenefitsForTier(tier).cashoutPayoutPct;
  return Number((Math.max(0, Number(potentialPayout) || 0) * pct).toFixed(2));
}

export function scaleSpinPrize(value, tier) {
  const multiplier = getBenefitsForTier(tier).spinMultiplier || 1;
  return Math.round((Number(value) || 0) * multiplier);
}

export function getVipBenefitsCatalog() {
  return {
    success: true,
    standardPointsPer100: LOYALTY_POINTS_PER_100_STANDARD,
    silverPointsPer100: LOYALTY_POINTS_PER_100_SILVER,
    goldPointsPer100: LOYALTY_POINTS_PER_100_GOLD,
    vipPointsPer100: LOYALTY_POINTS_PER_100_VIP,
    tierPoints: VIP_TIER_POINTS,
    redeemRate: LOYALTY_POINTS_PER_RUPEE,
    minDeposit: MIN_DEPOSIT_INR,
    minWithdraw: MIN_WITHDRAW_INR,
    tiers: Object.keys(TIER_BENEFITS),
    benefits: TIER_BENEFITS,
  };
}
