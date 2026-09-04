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

async function clawbackLoyaltyPointsInTxn(client, userId, pointsToRemove, meta = {}) {
  const remove = Math.max(0, Number(pointsToRemove) || 0);
  if (!userId || remove <= 0) {
    return { clawed: 0, points: 0, vipPoints: 0, tier: 'BRONZE' };
  }

  if (meta.referenceId) {
    const prior = await client.query(
      `SELECT 1 FROM loyalty_ledger
       WHERE user_id = $1 AND entry_type = 'CLAWBACK' AND reference_id = $2
       LIMIT 1`,
      [userId, meta.referenceId],
    ).catch(() => ({ rows: [] }));
    if (prior.rows.length > 0) {
      const cur = await client.query(
        `SELECT points, COALESCE(vip_points, points) AS vip_points, tier
         FROM user_loyalty WHERE user_id = $1`,
        [userId],
      );
      const row = cur.rows[0];
      return {
        clawed: 0,
        points: getRedeemablePointsFromRow(row),
        vipPoints: getVipPointsFromRow(row),
        tier: row?.tier || 'BRONZE',
        alreadyClawed: true,
      };
    }
  }

  const locked = await client.query(
    `SELECT points, COALESCE(vip_points, points) AS vip_points, tier
     FROM user_loyalty WHERE user_id = $1 FOR UPDATE`,
    [userId],
  );
  if (!locked.rows.length) {
    return { clawed: 0, points: 0, vipPoints: 0, tier: 'BRONZE' };
  }

  const available = getRedeemablePointsFromRow(locked.rows[0]);
  const vipBefore = getVipPointsFromRow(locked.rows[0]);
  const clawedRedeemable = Math.min(available, remove);
  const clawedVip = Math.min(vipBefore, remove);
  const nextPoints = Number((available - clawedRedeemable).toFixed(2));
  const nextVip = Number((vipBefore - clawedVip).toFixed(2));
  const nextTier = loyaltyTierFromPoints(nextVip);

  await client.query(
    `UPDATE user_loyalty
     SET points = $1,
         vip_points = $2,
         tier = $3,
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $4`,
    [nextPoints, nextVip, nextTier, userId],
  );

  await recordLoyaltyLedger(client, {
    userId,
    entryType: 'CLAWBACK',
    pointsDelta: -clawedRedeemable,
    pointsAfter: nextPoints,
    vipPointsAfter: nextVip,
    source: meta.source || 'clawback',
    referenceId: meta.referenceId || null,
  });

  return {
    clawed: clawedRedeemable,
    points: nextPoints,
    vipPoints: nextVip,
    tier: nextTier,
  };
}

/**
 * Reverse stake-earned loyalty/VIP points (e.g. voided cash bet).
 * Floors both balances at 0; tier may downgrade. Does not reclaim tier-up wallet rewards.
 */
export async function clawbackLoyaltyPoints(exec, userId, pointsToRemove, meta = {}) {
  if (isTxnClient(exec)) {
    return clawbackLoyaltyPointsInTxn(exec, userId, pointsToRemove, meta);
  }
  await ensureLoyaltyLedgerSchema().catch(() => null);
  return withTransaction((client) => clawbackLoyaltyPointsInTxn(client, userId, pointsToRemove, meta));
}

/**
 * Resolve points earned for a bet (ledger first) and claw them back.
 */
export async function clawbackLoyaltyForBet(exec, {
  userId,
  betId,
  stake,
  tierAtEarn = 'BRONZE',
} = {}) {
  if (!userId || !betId) {
    return { clawed: 0, points: 0, vipPoints: 0, tier: 'BRONZE' };
  }

  const run = async (client) => {
    let amount = 0;
    const earnRow = await client.query(
      `SELECT points_delta FROM loyalty_ledger
       WHERE user_id = $1 AND entry_type = 'EARN' AND reference_id = $2
       ORDER BY id DESC LIMIT 1`,
      [userId, betId],
    ).catch(() => ({ rows: [] }));
    if (earnRow.rows.length) {
      amount = Math.max(0, Number(earnRow.rows[0].points_delta) || 0);
    } else {
      const { pointsFromSpendAtTier } = await import('./vipBenefits.mjs');
      const loyalty = await client.query(
        `SELECT tier FROM user_loyalty WHERE user_id = $1`,
        [userId],
      );
      const tier = loyalty.rows[0]?.tier || tierAtEarn || 'BRONZE';
      amount = pointsFromSpendAtTier(stake, tier);
    }
    if (amount <= 0) {
      return { clawed: 0, points: 0, vipPoints: 0, tier: 'BRONZE' };
    }
    return clawbackLoyaltyPointsInTxn(client, userId, amount, {
      source: 'bet_void',
      referenceId: betId,
    });
  };

  if (isTxnClient(exec)) return run(exec);
  await ensureLoyaltyLedgerSchema().catch(() => null);
  return withTransaction(run);
}
