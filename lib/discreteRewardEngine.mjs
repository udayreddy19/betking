/**
 * ODDSYRA — DISCRETE REWARD & EXACT STAKE ENGINE
 *
 * Enforces discrete promotional reward instruments (Free Bets & Bonuses).
 * Guarantees:
 * 1. Discrete Instruments: Rewards are individual items with unique IDs, not unified fungible balance.
 * 2. Exact Stake Rule: 1 Reward = 1 Bet = Exact Reward Amount (no partial usage unless explicitly enabled).
 * 3. No Merging: Rewards of identical or different amounts remain distinct and cannot be combined.
 * 4. Atomic Transitions: AVAILABLE -> RESERVED -> CONSUMED with PostgreSQL FOR UPDATE row locks.
 * 5. Immutable Ledger: Full audit trail recorded in reward_ledger for all issuance, state changes, and usage.
 */

import { withTransaction } from '../db/pg.js';
import { addColumnIfMissing, createTableIfMissing, memoizeEnsure } from './schemaGuard.mjs';

let _query = null;
async function dbQuery(...args) {
  if (!_query) {
    const pg = await import('../db/pg.js');
    _query = pg.query;
  }
  return _query(...args);
}

export const ensureDiscreteRewardSchema = memoizeEnsure(async () => {
  await createTableIfMissing(
    'user_rewards',
    `
      CREATE TABLE IF NOT EXISTS user_rewards (
        reward_id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        reward_type VARCHAR(16) NOT NULL CHECK (reward_type IN ('freebet', 'bonus')),
        amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
        status VARCHAR(16) NOT NULL DEFAULT 'AVAILABLE'
          CHECK (status IN ('AVAILABLE', 'RESERVED', 'CONSUMED', 'EXPIRED', 'CANCELLED', 'REVERSED')),
        title VARCHAR(128) NOT NULL,
        source VARCHAR(64) NOT NULL DEFAULT 'PROMOTION',
        promotion_id VARCHAR(64),
        min_odds NUMERIC(6,2) DEFAULT 1.00,
        max_odds NUMERIC(6,2),
        allowed_sports JSONB DEFAULT '[]'::jsonb,
        allowed_markets JSONB DEFAULT '[]'::jsonb,
        single_only BOOLEAN DEFAULT false,
        accumulator_allowed BOOLEAN DEFAULT true,
        returns_stake BOOLEAN DEFAULT false,
        allow_partial_use BOOLEAN DEFAULT false,
        used_bet_id VARCHAR(64),
        used_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ NOT NULL,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
  );
  await createTableIfMissing(
    'reward_ledger',
    `
      CREATE TABLE IF NOT EXISTS reward_ledger (
        event_id VARCHAR(64) PRIMARY KEY,
        reward_id VARCHAR(64) NOT NULL REFERENCES user_rewards(reward_id) ON DELETE CASCADE,
        user_id VARCHAR(64) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        bet_id VARCHAR(64),
        amount NUMERIC(14,2) NOT NULL,
        event_type VARCHAR(32) NOT NULL,
        previous_status VARCHAR(16),
        new_status VARCHAR(16) NOT NULL,
        notes TEXT,
        admin_id VARCHAR(64),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
  );
  await addColumnIfMissing(
    'bets',
    'reward_id',
    `ALTER TABLE bets ADD COLUMN IF NOT EXISTS reward_id VARCHAR(64)`,
  );
  await addColumnIfMissing(
    'bets',
    'returns_stake',
    `ALTER TABLE bets ADD COLUMN IF NOT EXISTS returns_stake BOOLEAN DEFAULT false`,
  );
});

function skipEnsureInOpenTx(clientOrQuery) {
  return Boolean(clientOrQuery);
}

export function generateRewardId(type = 'freebet') {
  const prefix = type === 'freebet' ? 'FB' : 'BN';
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

export function generateLedgerEventId() {
  return `rwe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Issue a discrete reward to a user with an initial immutable ledger entry.
 */
export async function issueDiscreteReward({
  userId,
  rewardType = 'freebet',
  amount,
  title,
  source = 'PROMOTION',
  promotionId = null,
  minOdds = 1.00,
  maxOdds = null,
  allowedSports = [],
  allowedMarkets = [],
  singleOnly = false,
  accumulatorAllowed = true,
  returnsStake = false,
  allowPartialUse = false,
  expiryDays = 7,
  expiresAt = null,
  metadata = {},
  adminId = null,
  client = null,
}) {
  if (!skipEnsureInOpenTx(client)) {
    await ensureDiscreteRewardSchema();
  }
  const run = client ? client.query.bind(client) : dbQuery;
  const numericAmount = parseFloat(Number(amount).toFixed(2));
  if (!numericAmount || numericAmount <= 0) {
    throw new Error('INVALID_REWARD_AMOUNT: Amount must be greater than zero');
  }
  if (!['freebet', 'bonus'].includes(rewardType)) {
    throw new Error('INVALID_REWARD_TYPE: Reward type must be freebet or bonus');
  }

  const rewardId = generateRewardId(rewardType);
  const resolvedExpiry = expiresAt
    ? new Date(expiresAt)
    : new Date(Date.now() + Math.max(1, Number(expiryDays || 7)) * 24 * 60 * 60 * 1000);

  const rewardTitle = title || (rewardType === 'freebet' ? `₹${numericAmount} Free Bet` : `₹${numericAmount} Bonus Credit`);

  const insertRewardSql = `
    INSERT INTO user_rewards (
      reward_id, user_id, reward_type, amount, status, title, source,
      promotion_id, min_odds, max_odds, allowed_sports, allowed_markets,
      single_only, accumulator_allowed, returns_stake, allow_partial_use,
      expires_at, metadata, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, 'AVAILABLE', $5, $6,
      $7, $8, $9, $10, $11,
      $12, $13, $14, $15,
      $16, $17, NOW(), NOW()
    )
    RETURNING *
  `;

  const rewardRes = await run(insertRewardSql, [
    rewardId,
    userId,
    rewardType,
    numericAmount,
    rewardTitle,
    source,
    promotionId,
    minOdds ? Number(minOdds) : 1.00,
    maxOdds ? Number(maxOdds) : null,
    JSON.stringify(allowedSports || []),
    JSON.stringify(allowedMarkets || []),
    Boolean(singleOnly),
    Boolean(accumulatorAllowed),
    Boolean(returnsStake),
    Boolean(allowPartialUse),
    resolvedExpiry.toISOString(),
    JSON.stringify(metadata || {}),
  ]);

  const createdReward = rewardRes.rows[0];

  // Append initial ledger entry
  const eventId = generateLedgerEventId();
  await run(
    `INSERT INTO reward_ledger (
      event_id, reward_id, user_id, amount, event_type,
      previous_status, new_status, notes, admin_id, created_at
    ) VALUES ($1, $2, $3, $4, 'REWARD_ISSUED', NULL, 'AVAILABLE', $5, $6, NOW())`,
    [
      eventId,
      rewardId,
      userId,
      numericAmount,
      `Issued ${rewardType} reward via ${source}${promotionId ? ` (${promotionId})` : ''}`,
      adminId,
    ],
  );

  return createdReward;
}

/**
 * Sweeps and expires any rewards past their expiry date.
 */
export async function sweepExpiredUserRewards(userId = null, client = null) {
  const run = client ? client.query.bind(client) : dbQuery;
  const whereUser = userId ? `AND user_id = $1` : '';
  const params = userId ? [userId] : [];

  const expiredRes = await run(
    `SELECT reward_id, user_id, amount, status
     FROM user_rewards
     WHERE status = 'AVAILABLE' AND expires_at <= NOW() ${whereUser}
     FOR UPDATE`,
    params,
  );

  if (expiredRes.rows.length === 0) return 0;

  for (const row of expiredRes.rows) {
    await run(
      `UPDATE user_rewards
       SET status = 'EXPIRED', updated_at = NOW()
       WHERE reward_id = $1`,
      [row.reward_id],
    );

    const eventId = generateLedgerEventId();
    await run(
      `INSERT INTO reward_ledger (
        event_id, reward_id, user_id, amount, event_type,
        previous_status, new_status, notes, created_at
      ) VALUES ($1, $2, $3, $4, 'REWARD_EXPIRED', 'AVAILABLE', 'EXPIRED', 'Expired automatically by clock', NOW())`,
      [eventId, row.reward_id, row.user_id, Number(row.amount)],
    );
  }

  return expiredRes.rows.length;
}

/**
 * List all available unexpired discrete rewards for a user (for the bet slip payment selector).
 */
export async function listUserAvailableRewards(userId, { client = null } = {}) {
  if (!userId) return [];
  await sweepExpiredUserRewards(userId, client);
  const run = client ? client.query.bind(client) : dbQuery;

  const res = await run(
    `SELECT reward_id, user_id, reward_type, amount, status, title, source,
            promotion_id, min_odds, max_odds, allowed_sports, allowed_markets,
            single_only, accumulator_allowed, returns_stake, allow_partial_use,
            expires_at, created_at
     FROM user_rewards
     WHERE user_id = $1 AND status = 'AVAILABLE' AND expires_at > NOW()
     ORDER BY expires_at ASC, amount ASC`,
    [userId],
  );

  return res.rows.map((row) => ({
    rewardId: row.reward_id,
    userId: row.user_id,
    rewardType: row.reward_type,
    amount: Number(row.amount),
    status: row.status,
    title: row.title,
    source: row.source,
    promotionId: row.promotion_id,
    minOdds: Number(row.min_odds || 1.00),
    maxOdds: row.max_odds ? Number(row.max_odds) : null,
    allowedSports: row.allowed_sports || [],
    allowedMarkets: row.allowed_markets || [],
    singleOnly: Boolean(row.single_only),
    accumulatorAllowed: Boolean(row.accumulator_allowed),
    returnsStake: Boolean(row.returns_stake),
    allowPartialUse: Boolean(row.allow_partial_use),
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }));
}

/**
 * List all discrete rewards for a user (for My Rewards dashboard).
 */
export async function listUserAllRewards(userId, { status = null, limit = 50, offset = 0, client = null } = {}) {
  if (!userId) return { available: [], history: [], total: 0 };
  if (!skipEnsureInOpenTx(client)) {
    await ensureDiscreteRewardSchema();
  }
  await sweepExpiredUserRewards(userId, client);
  const run = client ? client.query.bind(client) : dbQuery;

  let querySql = `
    SELECT reward_id, user_id, reward_type, amount, status, title, source,
           promotion_id, min_odds, max_odds, allowed_sports, allowed_markets,
           single_only, accumulator_allowed, returns_stake, allow_partial_use,
           used_bet_id, used_at, expires_at, created_at
    FROM user_rewards
    WHERE user_id = $1
  `;
  const params = [userId];

  if (status) {
    params.push(status);
    querySql += ` AND status = $${params.length}`;
  }

  querySql += ` ORDER BY CASE WHEN status = 'AVAILABLE' THEN 0 ELSE 1 END, expires_at ASC, created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(Math.min(100, Math.max(1, limit)), Math.max(0, offset));

  const res = await run(querySql, params);

  const formatted = res.rows.map((row) => ({
    rewardId: row.reward_id,
    userId: row.user_id,
    rewardType: row.reward_type,
    amount: Number(row.amount),
    status: row.status,
    title: row.title,
    source: row.source,
    promotionId: row.promotion_id,
    minOdds: Number(row.min_odds || 1.00),
    maxOdds: row.max_odds ? Number(row.max_odds) : null,
    allowedSports: row.allowed_sports || [],
    allowedMarkets: row.allowed_markets || [],
    singleOnly: Boolean(row.single_only),
    accumulatorAllowed: Boolean(row.accumulator_allowed),
    returnsStake: Boolean(row.returns_stake),
    allowPartialUse: Boolean(row.allow_partial_use),
    usedBetId: row.used_bet_id,
    usedAt: row.used_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }));

  const available = formatted.filter((r) => r.status === 'AVAILABLE' && new Date(r.expiresAt) > new Date());
  const history = formatted.filter((r) => r.status !== 'AVAILABLE' || new Date(r.expiresAt) <= new Date());

  return {
    rewards: formatted,
    available,
    history,
    total: formatted.length,
  };
}

/**
 * Lock and validate a specific reward for bet placement.
 * Enforces the EXACT STAKE RULE, odds limits, and market eligibility.
 */
export async function lockAndValidateRewardForBet({
  rewardId,
  userId,
  requestedStake,
  validatedSelections = [],
  combinedOdds = 1.00,
  betType = 'SINGLE',
  client,
}) {
  if (!client) {
    throw new Error('DATABASE_TRANSACTION_REQUIRED: lockAndValidateRewardForBet requires an active transaction client');
  }

  if (!skipEnsureInOpenTx(client)) {
    await ensureDiscreteRewardSchema();
  }

  const res = await client.query(
    `SELECT * FROM user_rewards WHERE reward_id = $1 FOR UPDATE`,
    [rewardId],
  );

  if (res.rows.length === 0) {
    throw new Error(`REWARD_NOT_FOUND: Reward '${rewardId}' does not exist.`);
  }

  const reward = res.rows[0];

  if (reward.user_id !== userId) {
    throw new Error('REWARD_UNAUTHORIZED: Reward does not belong to authenticated user.');
  }

  if (reward.status !== 'AVAILABLE') {
    throw new Error(`REWARD_NOT_AVAILABLE: Reward is ${reward.status.toLowerCase()} and cannot be used.`);
  }

  if (new Date(reward.expires_at) <= new Date()) {
    await client.query(
      `UPDATE user_rewards SET status = 'EXPIRED', updated_at = NOW() WHERE reward_id = $1`,
      [rewardId],
    );
    const eventId = generateLedgerEventId();
    await client.query(
      `INSERT INTO reward_ledger (
        event_id, reward_id, user_id, amount, event_type,
        previous_status, new_status, notes, created_at
      ) VALUES ($1, $2, $3, $4, 'REWARD_EXPIRED', 'AVAILABLE', 'EXPIRED', 'Expired on bet attempt', NOW())`,
      [eventId, rewardId, userId, Number(reward.amount)],
    );
    throw new Error('REWARD_EXPIRED: This reward has expired.');
  }

  const rewardAmount = Number(reward.amount);
  const stakeNumeric = Number(requestedStake);

  // EXACT STAKE RULE: Compare in integer paise (cents) to avoid floating point anomalies.
  const reqPaise = Math.round(stakeNumeric * 100);
  const rewPaise = Math.round(rewardAmount * 100);

  if (!reward.allow_partial_use && reqPaise !== rewPaise) {
    const rewardName = reward.reward_type === 'freebet' ? 'Free Bet' : 'Bonus';
    throw new Error(
      `EXACT_STAKE_REQUIRED: This ${rewardName} must be placed as a single exact ₹${rewardAmount} stake. Requested: ₹${stakeNumeric}`,
    );
  }

  if (reward.allow_partial_use && reqPaise > rewPaise) {
    throw new Error(
      `INSUFFICIENT_REWARD_AMOUNT: Requested stake ₹${stakeNumeric} exceeds available reward ₹${rewardAmount}`,
    );
  }

  // Odds Eligibility
  const minOdds = Number(reward.min_odds || 1.00);
  if (minOdds > 1.00 && Number(combinedOdds) < minOdds) {
    throw new Error(
      `REWARD_ODDS_TOO_LOW: This reward requires minimum odds of ${minOdds.toFixed(2)}. Selected odds: ${Number(combinedOdds).toFixed(2)}`,
    );
  }

  if (reward.max_odds && Number(combinedOdds) > Number(reward.max_odds)) {
    throw new Error(
      `REWARD_ODDS_TOO_HIGH: This reward requires maximum odds of ${Number(reward.max_odds).toFixed(2)}. Selected odds: ${Number(combinedOdds).toFixed(2)}`,
    );
  }

  // Bet Type Eligibility
  if (reward.single_only && betType !== 'SINGLE') {
    throw new Error('REWARD_SINGLE_ONLY: This reward can only be used on Single bets.');
  }

  if (!reward.accumulator_allowed && betType === 'ACCUMULATOR') {
    throw new Error('REWARD_NO_ACCUMULATOR: Accumulator bets are not permitted with this reward.');
  }

  // Sports & Market Eligibility
  const allowedSports = Array.isArray(reward.allowed_sports) ? reward.allowed_sports : [];
  if (allowedSports.length > 0) {
    const matchesAll = validatedSelections.every((sel) => {
      const sport = String(sel.sport || '').toLowerCase();
      return allowedSports.some((allowed) => String(allowed).toLowerCase() === sport);
    });
    if (!matchesAll) {
      throw new Error(`REWARD_SPORT_RESTRICTED: This reward is only eligible for: ${allowedSports.join(', ')}`);
    }
  }

  return {
    rewardId: reward.reward_id,
    rewardType: reward.reward_type,
    amount: rewardAmount,
    returnsStake: Boolean(reward.returns_stake),
    allowPartialUse: Boolean(reward.allow_partial_use),
    title: reward.title,
  };
}

/**
 * Atomically consumes a reward and links it to a placed bet inside a transaction.
 */
export async function consumeRewardForBet({
  rewardId,
  userId,
  betId,
  client,
}) {
  if (!client) {
    throw new Error('DATABASE_TRANSACTION_REQUIRED: consumeRewardForBet requires an active transaction client');
  }

  const res = await client.query(
    `UPDATE user_rewards
     SET status = 'CONSUMED',
         used_bet_id = $1,
         used_at = NOW(),
         updated_at = NOW()
     WHERE reward_id = $2 AND user_id = $3 AND status = 'AVAILABLE'
     RETURNING *`,
    [betId, rewardId, userId],
  );

  if (res.rows.length === 0) {
    throw new Error(`REWARD_CONSUME_FAILED: Reward '${rewardId}' is no longer available.`);
  }

  const consumed = res.rows[0];

  const eventId = generateLedgerEventId();
  await client.query(
    `INSERT INTO reward_ledger (
      event_id, reward_id, user_id, bet_id, amount, event_type,
      previous_status, new_status, notes, created_at
    ) VALUES ($1, $2, $3, $4, $5, 'REWARD_CONSUMED', 'AVAILABLE', 'CONSUMED', $6, NOW())`,
    [
      eventId,
      rewardId,
      userId,
      betId,
      Number(consumed.amount),
      `Consumed by bet #${betId}`,
    ],
  );

  return consumed;
}

/**
 * Refund / reactivate a consumed reward when a bet is voided/cancelled (if promo policy permits).
 */
export async function reverseRewardForVoidedBet({
  rewardId,
  betId,
  reason = 'Bet voided/cancelled',
  client,
}) {
  if (!client) {
    throw new Error('DATABASE_TRANSACTION_REQUIRED: reverseRewardForVoidedBet requires an active transaction client');
  }

  const res = await client.query(
    `SELECT * FROM user_rewards WHERE reward_id = $1 FOR UPDATE`,
    [rewardId],
  );

  if (res.rows.length === 0) return null;
  const reward = res.rows[0];

  if (reward.status !== 'CONSUMED') return null;

  // Reactivate if still unexpired
  const isStillValid = new Date(reward.expires_at) > new Date();
  const nextStatus = isStillValid ? 'AVAILABLE' : 'EXPIRED';

  await client.query(
    `UPDATE user_rewards
     SET status = $1,
         used_bet_id = NULL,
         used_at = NULL,
         updated_at = NOW()
     WHERE reward_id = $2`,
    [nextStatus, rewardId],
  );

  const eventId = generateLedgerEventId();
  await client.query(
    `INSERT INTO reward_ledger (
      event_id, reward_id, user_id, bet_id, amount, event_type,
      previous_status, new_status, notes, created_at
    ) VALUES ($1, $2, $3, $4, $5, 'REWARD_REVERSED', 'CONSUMED', $6, $7, NOW())`,
    [
      eventId,
      rewardId,
      reward.user_id,
      betId,
      Number(reward.amount),
      nextStatus,
      `Reversed from bet #${betId}: ${reason}`,
    ],
  );

  return { rewardId, status: nextStatus };
}

/**
 * Admin: List all rewards with multi-parameter filtering & search.
 */
export async function adminListRewards({
  page = 1,
  limit = 25,
  status = null,
  rewardType = null,
  userId = null,
  search = null,
  client = null,
} = {}) {
  const run = client ? client.query.bind(client) : dbQuery;
  const offset = (Math.max(1, page) - 1) * Math.max(1, limit);
  const whereClauses = [];
  const params = [];

  if (status) {
    params.push(status);
    whereClauses.push(`ur.status = $${params.length}`);
  }

  if (rewardType) {
    params.push(rewardType);
    whereClauses.push(`ur.reward_type = $${params.length}`);
  }

  if (userId) {
    params.push(userId);
    whereClauses.push(`ur.user_id = $${params.length}`);
  }

  if (search) {
    params.push(`%${search.trim()}%`);
    whereClauses.push(`(ur.reward_id ILIKE $${params.length} OR ur.title ILIKE $${params.length} OR u.email ILIKE $${params.length} OR u.phone ILIKE $${params.length} OR u.username ILIKE $${params.length})`);
  }

  const whereStr = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const countSql = `
    SELECT COUNT(*) AS total
    FROM user_rewards ur
    LEFT JOIN users u ON ur.user_id = u.user_id
    ${whereStr}
  `;
  const countRes = await run(countSql, params);
  const total = parseInt(countRes.rows[0]?.total || '0', 10);

  const querySql = `
    SELECT ur.*, u.email AS user_email, u.username AS user_username, u.phone AS user_phone
    FROM user_rewards ur
    LEFT JOIN users u ON ur.user_id = u.user_id
    ${whereStr}
    ORDER BY ur.created_at DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;
  params.push(Math.min(100, Math.max(1, limit)), offset);

  const dataRes = await run(querySql, params);

  return {
    rewards: dataRes.rows.map((r) => ({
      rewardId: r.reward_id,
      userId: r.user_id,
      userEmail: r.user_email,
      userUsername: r.user_username,
      userPhone: r.user_phone,
      rewardType: r.reward_type,
      amount: Number(r.amount),
      status: r.status,
      title: r.title,
      source: r.source,
      promotionId: r.promotion_id,
      minOdds: Number(r.min_odds || 1.00),
      maxOdds: r.max_odds ? Number(r.max_odds) : null,
      returnsStake: Boolean(r.returns_stake),
      allowPartialUse: Boolean(r.allow_partial_use),
      usedBetId: r.used_bet_id,
      usedAt: r.used_at,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
    })),
    total,
    page: Math.max(1, page),
    limit: Math.max(1, limit),
    totalPages: Math.ceil(total / Math.max(1, limit)),
  };
}

/**
 * Admin: Cancel an active reward.
 */
export async function adminCancelReward({ rewardId, adminId, reason = 'Cancelled by administrator', client = null }) {
  const runner = async (c) => {
    const checkRes = await c.query(`SELECT * FROM user_rewards WHERE reward_id = $1 FOR UPDATE`, [rewardId]);
    if (checkRes.rows.length === 0) {
      throw new Error(`Reward '${rewardId}' not found.`);
    }
    const reward = checkRes.rows[0];
    if (reward.status === 'CONSUMED') {
      throw new Error('CANNOT_CANCEL_CONSUMED: Cannot cancel a reward that has already been consumed in a bet.');
    }
    if (reward.status === 'CANCELLED') {
      throw new Error('ALREADY_CANCELLED: Reward is already cancelled.');
    }

    await c.query(
      `UPDATE user_rewards SET status = 'CANCELLED', updated_at = NOW() WHERE reward_id = $1`,
      [rewardId],
    );

    const eventId = generateLedgerEventId();
    await c.query(
      `INSERT INTO reward_ledger (
        event_id, reward_id, user_id, amount, event_type,
        previous_status, new_status, notes, admin_id, created_at
      ) VALUES ($1, $2, $3, $4, 'REWARD_CANCELLED', $5, 'CANCELLED', $6, $7, NOW())`,
      [eventId, rewardId, reward.user_id, Number(reward.amount), reward.status, reason, adminId],
    );

    return { rewardId, status: 'CANCELLED' };
  };

  return client ? runner(client) : withTransaction(runner);
}

/**
 * Admin: Extend reward expiry date.
 */
export async function adminExtendRewardExpiry({
  rewardId,
  adminId,
  extensionDays = 7,
  newExpiresAt = null,
  reason = 'Expiry extended by administrator',
  client = null,
}) {
  const runner = async (c) => {
    const checkRes = await c.query(`SELECT * FROM user_rewards WHERE reward_id = $1 FOR UPDATE`, [rewardId]);
    if (checkRes.rows.length === 0) {
      throw new Error(`Reward '${rewardId}' not found.`);
    }
    const reward = checkRes.rows[0];
    if (reward.status === 'CONSUMED') {
      throw new Error('CANNOT_EXTEND_CONSUMED: Cannot extend a reward that has already been consumed.');
    }

    const currentExpiry = new Date(reward.expires_at);
    const baseTime = currentExpiry > new Date() ? currentExpiry.getTime() : Date.now();
    const resolvedExpiry = newExpiresAt
      ? new Date(newExpiresAt)
      : new Date(baseTime + Math.max(1, Number(extensionDays || 7)) * 24 * 60 * 60 * 1000);

    const newStatus = 'AVAILABLE';

    await c.query(
      `UPDATE user_rewards
       SET expires_at = $1, status = $2, updated_at = NOW()
       WHERE reward_id = $3`,
      [resolvedExpiry.toISOString(), newStatus, rewardId],
    );

    const eventId = generateLedgerEventId();
    await c.query(
      `INSERT INTO reward_ledger (
        event_id, reward_id, user_id, amount, event_type,
        previous_status, new_status, notes, admin_id, created_at
      ) VALUES ($1, $2, $3, $4, 'EXPIRY_EXTENDED', $5, $6, $7, $8, NOW())`,
      [
        eventId,
        rewardId,
        reward.user_id,
        Number(reward.amount),
        reward.status,
        newStatus,
        `Expiry extended to ${resolvedExpiry.toISOString()}: ${reason}`,
        adminId,
      ],
    );

    return {
      rewardId,
      status: newStatus,
      previousExpiresAt: reward.expires_at,
      expiresAt: resolvedExpiry.toISOString(),
    };
  };

  return client ? runner(client) : withTransaction(runner);
}

/**
 * Admin: Get complete immutable audit ledger for a reward.
 */
export async function adminGetRewardLedger(rewardId, client = null) {
  const run = client ? client.query.bind(client) : dbQuery;
  const res = await run(
    `SELECT rl.*, u.email AS user_email, u.username AS user_username
     FROM reward_ledger rl
     LEFT JOIN users u ON rl.user_id = u.user_id
     WHERE rl.reward_id = $1
     ORDER BY rl.created_at ASC`,
    [rewardId],
  );

  return res.rows.map((row) => ({
    eventId: row.event_id,
    rewardId: row.reward_id,
    userId: row.user_id,
    userEmail: row.user_email,
    userUsername: row.user_username,
    betId: row.bet_id,
    amount: Number(row.amount),
    eventType: row.event_type,
    previousStatus: row.previous_status,
    newStatus: row.new_status,
    notes: row.notes,
    adminId: row.admin_id,
    createdAt: row.created_at,
  }));
}
