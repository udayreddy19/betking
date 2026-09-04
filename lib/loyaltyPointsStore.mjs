/**
 * Shared loyalty/VIP point accounting.
 * - points: redeemable loyalty balance (can decrease on redeem)
 * - vip_points: lifetime VIP progression (never decreases on redeem)
 */

import { withTransaction } from '../db/pg.js';
import { loyaltyTierFromPoints } from './dailySpinPrizes.mjs';
import { grantCrossedTierRewards } from './vipEngine.mjs';
import { addColumnIfMissing, createTableIfMissing, memoizeEnsure } from './schemaGuard.mjs';

export const ensureVipPointsSchema = memoizeEnsure(async () => {
  // ADD COLUMN takes ACCESS EXCLUSIVE even with IF NOT EXISTS — never run it
  // on the request path if the column is already there (migration 056).
  await addColumnIfMissing(
    'user_loyalty',
    'vip_points',
    `ALTER TABLE user_loyalty ADD COLUMN IF NOT EXISTS vip_points NUMERIC(14,2) DEFAULT 0`,
  );
});

export const ensureLoyaltyLedgerSchema = memoizeEnsure(async () => {
  await createTableIfMissing(
    'loyalty_ledger',
    `CREATE TABLE IF NOT EXISTS loyalty_ledger (
       id BIGSERIAL PRIMARY KEY,
       user_id VARCHAR(64) NOT NULL REFERENCES users(user_id),
       entry_type VARCHAR(32) NOT NULL,
       points_delta NUMERIC(14,2) NOT NULL,
       points_after NUMERIC(14,2) NOT NULL,
       vip_points_after NUMERIC(14,2) NOT NULL,
       source VARCHAR(64),
       reference_id VARCHAR(128),
       created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`,
  );
  await addColumnIfMissing(
    'loyalty_ledger',
    'source',
    `ALTER TABLE loyalty_ledger ADD COLUMN IF NOT EXISTS source VARCHAR(64)`,
  );
});

function isTxnClient(exec) {
  return Boolean(exec && typeof exec.query === 'function' && typeof exec.release === 'function');
}

export function getVipPointsFromRow(row) {
  if (!row) return 0;
  return Number(row.vip_points ?? row.points ?? 0);
}

export function getRedeemablePointsFromRow(row) {
  if (!row) return 0;
  return Number(row.points ?? 0);
}

export async function recordLoyaltyLedger(client, {
  userId,
  entryType,
  pointsDelta,
  pointsAfter,
  vipPointsAfter,
  source = null,
  referenceId = null,
} = {}) {
  if (!client || !userId) return;
  try {
    await client.query(
      `INSERT INTO loyalty_ledger
         (user_id, entry_type, points_delta, points_after, vip_points_after, source, reference_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId,
        entryType,
        Number(pointsDelta) || 0,
        Number(pointsAfter) || 0,
        Number(vipPointsAfter) || 0,
        source,
        referenceId,
      ],
    );
  } catch (err) {
    // Table may not exist yet on older envs — never fail money/loyalty paths on ledger.
    if (err?.code === '42P01') return;
    throw err;
  }
}

async function earnLoyaltyPointsInTxn(client, userId, earned, meta = {}) {
  const locked = await client.query(
    `SELECT points, COALESCE(vip_points, points) AS vip_points, tier
     FROM user_loyalty WHERE user_id = $1 FOR UPDATE`,
    [userId],
  );
  const previousTier = locked.rows[0]?.tier || 'BRONZE';

  const upsert = await client.query(
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
    await client.query(
      `UPDATE user_loyalty SET tier = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2`,
      [nextTier, userId],
    );
    await grantCrossedTierRewards(client, userId, previousTier, nextTier);
  }

  await recordLoyaltyLedger(client, {
    userId,
    entryType: 'EARN',
    pointsDelta: earned,
    pointsAfter: getRedeemablePointsFromRow(row),
    vipPointsAfter: vipPoints,
    source: meta.source || 'earn',
    referenceId: meta.referenceId || null,
  });

  return {
    earned,
    points: getRedeemablePointsFromRow(row),
    vipPoints,
    tier: nextTier,
  };
}

/**
 * Award earned points to both redeemable balance and lifetime VIP progression.
 * Always runs inside a real transaction (reuses client when already in one).
 */
export async function earnLoyaltyPoints(exec, userId, pointsToAdd, meta = {}) {
  const earned = Math.max(0, Number(pointsToAdd) || 0);
  if (!userId || earned <= 0) {
    return { earned: 0, points: 0, vipPoints: 0, tier: 'BRONZE' };
  }

  if (isTxnClient(exec)) {
    return earnLoyaltyPointsInTxn(exec, userId, earned, meta);
  }

  // Ensure ledger outside the money txn (CREATE can take exclusive locks).
  await ensureLoyaltyLedgerSchema().catch(() => null);
  return withTransaction((client) => earnLoyaltyPointsInTxn(client, userId, earned, meta));
}

/**
 * Apply a loyalty-points prize from daily spin (both balances increase).
 */
export async function addSpinLoyaltyPoints(exec, userId, pointsToAdd) {
  return earnLoyaltyPoints(exec, userId, pointsToAdd, { source: 'daily_spin' });
}
