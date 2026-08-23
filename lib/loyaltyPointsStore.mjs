/**
 * Shared loyalty/VIP point accounting.
 * - points: redeemable loyalty balance (can decrease on redeem)
 * - vip_points: lifetime VIP progression (never decreases on redeem)
 */

import { loyaltyTierFromPoints } from './dailySpinPrizes.mjs';
import { grantCrossedTierRewards } from './vipEngine.mjs';

let vipPointsSchemaReady = null;

export async function ensureVipPointsSchema(q) {
  if (!vipPointsSchemaReady) {
    vipPointsSchemaReady = (async () => {
      try {
        await q(`ALTER TABLE user_loyalty ADD COLUMN IF NOT EXISTS vip_points NUMERIC(14,2)`);
        await q(`UPDATE user_loyalty SET vip_points = points WHERE vip_points IS NULL`);
      } catch {
        // Column may already exist or migration applied on deploy.
      }
    })();
  }
  await vipPointsSchemaReady;
}

export function getVipPointsFromRow(row) {
  if (!row) return 0;
  return Number(row.vip_points ?? row.points ?? 0);
}

export function getRedeemablePointsFromRow(row) {
  if (!row) return 0;
  return Number(row.points ?? 0);
}

/**
 * Award earned points to both redeemable balance and lifetime VIP progression.
 */
export async function earnLoyaltyPoints(exec, userId, pointsToAdd) {
  const earned = Math.max(0, Number(pointsToAdd) || 0);
  if (!userId || earned <= 0) {
    return { earned: 0, points: 0, vipPoints: 0, tier: 'BRONZE' };
  }

  const q = typeof exec.query === 'function' ? exec.query.bind(exec) : exec;
  await ensureVipPointsSchema(q);
  const locked = await q(
    `SELECT points, COALESCE(vip_points, points) AS vip_points, tier
     FROM user_loyalty WHERE user_id = $1 FOR UPDATE`,
    [userId],
  );
  const previousTier = locked.rows[0]?.tier || 'BRONZE';

  const upsert = await q(
    `INSERT INTO user_loyalty (user_id, points, vip_points, tier, updated_at)
     VALUES ($1, $2, $2, 'BRONZE', CURRENT_TIMESTAMP)
     ON CONFLICT (user_id) DO UPDATE SET
       points = user_loyalty.points + EXCLUDED.points,
       vip_points = COALESCE(user_loyalty.vip_points, user_loyalty.points) + EXCLUDED.points,
       updated_at = CURRENT_TIMESTAMP
     RETURNING points, COALESCE(vip_points, points) AS vip_points, tier`,
    [userId, earned],
  );

  const row = upsert.rows[0];
  const vipPoints = getVipPointsFromRow(row);
  const nextTier = loyaltyTierFromPoints(vipPoints);
  if (nextTier !== (row.tier || previousTier)) {
    await q(`UPDATE user_loyalty SET tier = $1 WHERE user_id = $2`, [nextTier, userId]);
    await grantCrossedTierRewards(exec, userId, previousTier, nextTier);
  }

  return {
    earned,
    points: getRedeemablePointsFromRow(row),
    vipPoints,
    tier: nextTier,
  };
}

/**
 * Apply a loyalty-points prize from daily spin (both balances increase).
 */
export async function addSpinLoyaltyPoints(exec, userId, pointsToAdd) {
  return earnLoyaltyPoints(exec, userId, pointsToAdd);
}
