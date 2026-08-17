/**
 * Enterprise Bonus & Promotion Engine — OddsYra Sportsbook (lib/promotionEngine.mjs)
 * Manages Welcome Bonuses, Cashback, Odds Boosts, Free Bets, Referral Rewards,
 * Deposit Bonuses, Mission Rewards, Loyalty Programs, and Promo Codes.
 */

const PROMO_CAMPAIGNS = new Map([
  ['WELCOME150', { code: 'WELCOME150', type: 'MATCH_DEPOSIT', percent: 150, maxAmount: 30000, active: true }],
  ['FREEBET500', { code: 'FREEBET500', type: 'FREE_BET', amount: 500, minOdds: 1.5, active: true }],
  ['ODDSBOOST10', { code: 'ODDSBOOST10', type: 'ODDS_BOOST', boostMultiplier: 1.10, active: true }],
]);

export function validateAndApplyPromoCode(code, userBalance = 0) {
  const promo = PROMO_CAMPAIGNS.get(String(code).toUpperCase());
  if (!promo || !promo.active) {
    return { valid: false, message: 'Invalid or expired promotional code' };
  }

  return {
    valid: true,
    code: promo.code,
    type: promo.type,
    bonusAmount: promo.amount || Math.min(promo.maxAmount || 0, userBalance * ((promo.percent || 100) / 100)),
    appliedAt: new Date().toISOString(),
  };
}
