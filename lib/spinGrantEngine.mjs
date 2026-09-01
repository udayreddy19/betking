/**
 * Daily spin bonus/freebet grants expire 24 hours after the spin if unused.
 */

import crypto from 'crypto';
import { query, withTransaction } from '../db/pg.js';
import { addColumnIfMissing, createTableIfMissing, memoizeEnsure } from './schemaGuard.mjs';

export const SPIN_PRIZE_TTL_MS = 24 * 60 * 60 * 1000;

export const ensureSpinGrantSchema = memoizeEnsure(async () => {
  await addColumnIfMissing(
    'daily_spins',
    'prize_expires_at',
    `ALTER TABLE daily_spins ADD COLUMN IF NOT EXISTS prize_expires_at TIMESTAMPTZ`,
  );
  const created = await createTableIfMissing(
    'spin_wallet_grants',
    `
      CREATE TABLE IF NOT EXISTS spin_wallet_grants (
        grant_id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        spin_id VARCHAR(64) NOT NULL REFERENCES daily_spins(spin_id) ON DELETE CASCADE,
        grant_type VARCHAR(16) NOT NULL CHECK (grant_type IN ('bonus', 'freebet')),
        original_amount NUMERIC(14,2) NOT NULL,
        remaining_amount NUMERIC(14,2) NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        expired_at TIMESTAMPTZ,
        CONSTRAINT spin_wallet_grants_remaining_check CHECK (remaining_amount >= 0)
      )
    `,
  );
  if (created) {
    await query(`
      CREATE INDEX IF NOT EXISTS idx_spin_grants_user_active
      ON spin_wallet_grants(user_id, status, expires_at)
    `);
  }
});

export function spinPrizeExpiresAt(fromDate = new Date()) {
  return new Date(fromDate.getTime() + SPIN_PRIZE_TTL_MS);
}

export async function createSpinGrant(exec, {
  userId,
  spinId,
  grantType,
  amount,
  expiresAt,
}) {
  const q = typeof exec.query === 'function' ? exec.query.bind(exec) : exec;
  const value = Number(amount) || 0;
  if (!userId || !spinId || value <= 0 || !['bonus', 'freebet'].includes(grantType)) {
    return null;
  }
  const grantId = `sg_${crypto.randomBytes(10).toString('hex')}`;
  await q(
    `INSERT INTO spin_wallet_grants (
       grant_id, user_id, spin_id, grant_type, original_amount, remaining_amount, expires_at, status
     ) VALUES ($1, $2, $3, $4, $5, $5, $6, 'ACTIVE')`,
    [grantId, userId, spinId, grantType, value, expiresAt],
  );
  return grantId;
}

export async function expireSpinGrants(exec, userId) {
  const q = typeof exec.query === 'function' ? exec.query.bind(exec) : exec;

  const expired = await q(
    `SELECT grant_id, grant_type, remaining_amount
     FROM spin_wallet_grants
     WHERE user_id = $1
       AND status = 'ACTIVE'
       AND expires_at <= NOW()
       AND remaining_amount > 0
     FOR UPDATE`,
    [userId],
  );
  if (!expired.rows.length) {
    return { expiredBonus: 0, expiredFreebet: 0 };
  }

  let bonusTotal = 0;
  let freebetTotal = 0;
  for (const row of expired.rows) {
    const amt = Number(row.remaining_amount) || 0;
    if (row.grant_type === 'bonus') bonusTotal += amt;
    else freebetTotal += amt;
    await q(
      `UPDATE spin_wallet_grants
       SET status = 'EXPIRED', remaining_amount = 0, expired_at = NOW()
       WHERE grant_id = $1`,
      [row.grant_id],
    );
  }

  const walletRes = await q(
    `SELECT wallet_id, bonus_balance, COALESCE(freebet_balance, 0) AS freebet_balance
     FROM wallets WHERE user_id = $1 FOR UPDATE`,
    [userId],
  );
  if (!walletRes.rows.length) {
    return { expiredBonus: bonusTotal, expiredFreebet: freebetTotal };
  }

  const wallet = walletRes.rows[0];
  const bonusDeduct = Math.min(bonusTotal, Number(wallet.bonus_balance || 0));
  const freebetDeduct = Math.min(freebetTotal, Number(wallet.freebet_balance || 0));

  if (bonusDeduct > 0) {
    await q(
      `UPDATE wallets SET bonus_balance = GREATEST(0, bonus_balance - $1), updated_at = NOW()
       WHERE wallet_id = $2`,
      [bonusDeduct, wallet.wallet_id],
    );
  }
  if (freebetDeduct > 0) {
    await q(
      `UPDATE wallets SET freebet_balance = GREATEST(0, freebet_balance - $1), updated_at = NOW()
       WHERE wallet_id = $2`,
      [freebetDeduct, wallet.wallet_id],
    );
  }

  return { expiredBonus: bonusDeduct, expiredFreebet: freebetDeduct };
}

export async function consumeSpinGrants(exec, userId, grantType, amount) {
  const q = typeof exec.query === 'function' ? exec.query.bind(exec) : exec;
  await expireSpinGrants(exec, userId);

  let left = Number(amount) || 0;
  if (left <= 0 || !['bonus', 'freebet'].includes(grantType)) return 0;

  const grants = await q(
    `SELECT grant_id, remaining_amount
     FROM spin_wallet_grants
     WHERE user_id = $1
       AND grant_type = $2
       AND status = 'ACTIVE'
       AND remaining_amount > 0
       AND expires_at > NOW()
     ORDER BY expires_at ASC, created_at ASC
     FOR UPDATE`,
    [userId, grantType],
  );

  let consumed = 0;
  for (const row of grants.rows) {
    if (left <= 0) break;
    const available = Number(row.remaining_amount) || 0;
    const take = Math.min(left, available);
    if (take <= 0) continue;
    left -= take;
    consumed += take;
    const next = Number((available - take).toFixed(2));
    await q(
      `UPDATE spin_wallet_grants
       SET remaining_amount = $1, status = $2
       WHERE grant_id = $3`,
      [next, next <= 0 ? 'USED' : 'ACTIVE', row.grant_id],
    );
  }
  return consumed;
}

export async function getActiveSpinGrantSummary(exec, userId) {
  const q = typeof exec.query === 'function' ? exec.query.bind(exec) : exec;

  const res = await q(
    `SELECT grant_type,
            SUM(remaining_amount)::float AS remaining,
            MIN(expires_at) AS next_expires_at
     FROM spin_wallet_grants
     WHERE user_id = $1
       AND status = 'ACTIVE'
       AND remaining_amount > 0
       AND expires_at > NOW()
     GROUP BY grant_type`,
    [userId],
  );

  const summary = {
    bonusRemaining: 0,
    freebetRemaining: 0,
    nextBonusExpiresAt: null,
    nextFreebetExpiresAt: null,
  };
  for (const row of res.rows) {
    if (row.grant_type === 'bonus') {
      summary.bonusRemaining = Number(row.remaining) || 0;
      summary.nextBonusExpiresAt = row.next_expires_at;
    } else if (row.grant_type === 'freebet') {
      summary.freebetRemaining = Number(row.remaining) || 0;
      summary.nextFreebetExpiresAt = row.next_expires_at;
    }
  }
  return summary;
}

/** Expire stale spin grants for one user. Do not call from GET /me. */
export async function refreshSpinGrantsForUser(userId) {
  if (!userId) return { expiredBonus: 0, expiredFreebet: 0 };
  return expireSpinGrants(query, userId);
}

/** Worker tick: expire due grants without touching the profile-read path. */
export async function expireDueSpinGrantsBatch({ limit = 50 } = {}) {
  const due = await query(
    `SELECT DISTINCT user_id
     FROM spin_wallet_grants
     WHERE status = 'ACTIVE'
       AND expires_at <= NOW()
       AND remaining_amount > 0
     LIMIT $1`,
    [Math.max(1, Math.min(200, Number(limit) || 50))],
  );
  let expiredBonus = 0;
  let expiredFreebet = 0;
  let errors = 0;
  for (const row of due.rows) {
    try {
      const result = await withTransaction((client) => expireSpinGrants(client, row.user_id));
      expiredBonus += result.expiredBonus || 0;
      expiredFreebet += result.expiredFreebet || 0;
    } catch {
      errors += 1;
    }
  }
  return { users: due.rows.length, expiredBonus, expiredFreebet, errors };
}
