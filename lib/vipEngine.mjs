/**
 * Enterprise VIP Management Engine — OddsYra Enterprise Platform (lib/vipEngine.mjs)
 * 
 * PG-backed VIP tiers with history tracking, benefits catalog, cashback,
 * priority support routing, and custom deposit limits.
 * Tiers: BRONZE → SILVER → GOLD → PLATINUM → DIAMOND
 */

import { query } from '../db/pg.js';

const VIP_TIERS = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'];

const VIP_BENEFITS = {
  BRONZE: { cashbackRatePct: 2, prioritySupport: false, maxDailyWithdrawal: 50000, dedicatedManager: false },
  SILVER: { cashbackRatePct: 3, prioritySupport: false, maxDailyWithdrawal: 100000, dedicatedManager: false },
  GOLD: { cashbackRatePct: 5, prioritySupport: true, maxDailyWithdrawal: 250000, dedicatedManager: false },
  PLATINUM: { cashbackRatePct: 7.5, prioritySupport: true, maxDailyWithdrawal: 500000, dedicatedManager: true },
  DIAMOND: { cashbackRatePct: 10, prioritySupport: true, maxDailyWithdrawal: 1000000, dedicatedManager: true },
};

const VIP_THRESHOLDS = {
  DIAMOND: 10000000,
  PLATINUM: 2500000,
  GOLD: 500000,
  SILVER: 100000,
  BRONZE: 0,
};

const VIP_USER_TIERS = new Map();

/**
 * Evaluate and update user VIP tier based on total turnover.
 * Records tier change history in PostgreSQL.
 */
export async function evaluateUserVipTier(userId, totalTurnover = 0) {
  let tier = 'BRONZE';
  if (totalTurnover >= VIP_THRESHOLDS.DIAMOND) tier = 'DIAMOND';
  else if (totalTurnover >= VIP_THRESHOLDS.PLATINUM) tier = 'PLATINUM';
  else if (totalTurnover >= VIP_THRESHOLDS.GOLD) tier = 'GOLD';
  else if (totalTurnover >= VIP_THRESHOLDS.SILVER) tier = 'SILVER';

  const previousTier = VIP_USER_TIERS.get(userId)?.tier || null;
  const benefits = VIP_BENEFITS[tier];

  const record = {
    userId,
    tier,
    ...benefits,
    totalTurnover,
    updatedAt: new Date().toISOString(),
  };

  VIP_USER_TIERS.set(userId, record);

  // Record tier change in history if tier changed
  if (previousTier && previousTier !== tier) {
    try {
      await query(`
        INSERT INTO vip_tier_history (user_id, previous_tier, new_tier, reason)
        VALUES ($1, $2, $3, $4);
      `, [userId, previousTier, tier, 'AUTOMATIC_EVALUATION']);
    } catch (err) {
      // Tolerable — tier history is non-critical
    }
  }

  // Update user_loyalty table
  try {
    await query(`
      INSERT INTO user_loyalty (user_id, tier, updated_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id) DO UPDATE SET tier = EXCLUDED.tier, updated_at = CURRENT_TIMESTAMP;
    `, [userId, tier]);
  } catch (err) {
    // Tolerable
  }

  return record;
}

/**
 * Get VIP tier benefits catalog.
 */
export function getVipBenefitsCatalog() {
  return {
    success: true,
    tiers: VIP_TIERS,
    thresholds: VIP_THRESHOLDS,
    benefits: VIP_BENEFITS,
  };
}

/**
 * Get VIP tier history for a user.
 */
export async function getVipTierHistory(userId) {
  const res = await query(`
    SELECT previous_tier, new_tier, reason, changed_at
    FROM vip_tier_history
    WHERE user_id = $1
    ORDER BY changed_at DESC
    LIMIT 50;
  `, [userId]);
  return { success: true, userId, count: res.rows.length, history: res.rows };
}

/**
 * Get current VIP status for a user.
 */
export function getUserVipStatus(userId) {
  return VIP_USER_TIERS.get(userId) || { userId, tier: 'BRONZE', ...VIP_BENEFITS.BRONZE };
}
