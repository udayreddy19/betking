import { query, withTransaction } from '../db/pg.js';

/**
 * Enterprise Account Restrictions & Compliance Engine
 */
export async function restrictAccount({
  userId,
  type = 'PERMANENT_RESTRICTION', // PERMANENT_RESTRICTION | TEMPORARY_SUSPENSION | WITHDRAWAL_HOLD
  reason = 'Admin security action',
  actorId = 'ADMIN',
  expiresAt = null,
}) {
  return await withTransaction(async (client) => {
    // 1. Update user_profiles account_status
    await client.query(`
      UPDATE user_profiles
      SET account_status = 'RESTRICTED', updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1;
    `, [userId]);

    // 2. Mirror restriction into user_account_controls (used by bet/withdraw engines)
    const controlId = `ctrl_${userId}_${Date.now()}`;
    await client.query(`
      INSERT INTO user_account_controls (control_id, user_id, account_state, reason, category, operator_id, restricted_until)
      VALUES ($1, $2, 'RESTRICTED_FROM_BETTING', $3, $4, $5, $6)
      ON CONFLICT (user_id) DO UPDATE SET
        account_state = EXCLUDED.account_state,
        reason = EXCLUDED.reason,
        category = EXCLUDED.category,
        operator_id = EXCLUDED.operator_id,
        restricted_until = EXCLUDED.restricted_until,
        updated_at = CURRENT_TIMESTAMP;
    `, [controlId, userId, reason, type, actorId, expiresAt]);

    // 3. Insert account_restrictions audit record
    const restrictionId = `restr_${userId}_${Date.now()}`;
    await client.query(`
      INSERT INTO account_restrictions (restriction_id, user_id, type, reason, status, created_by, expires_at)
      VALUES ($1, $2, $3, $4, 'ACTIVE', $5, $6);
    `, [restrictionId, userId, type, reason, actorId, expiresAt]);

    // 3. Audit Log
    await client.query(`
      INSERT INTO audit_events (actor_id, target_id, action, details)
      VALUES ($1, $2, 'ACCOUNT_RESTRICTED', $3);
    `, [actorId, userId, JSON.stringify({ type, reason, restrictionId })]);

    return { success: true, userId, restrictionId, status: 'RESTRICTED' };
  });
}

export async function releaseAccount({
  userId,
  actorId = 'ADMIN',
  reason = 'Admin approval release',
}) {
  return await withTransaction(async (client) => {
    // 1. Update user_profiles account_status
    await client.query(`
      UPDATE user_profiles
      SET account_status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1;
    `, [userId]);

    // 2. Release active restrictions
    await client.query(`
      UPDATE account_restrictions
      SET status = 'RELEASED', released_at = CURRENT_TIMESTAMP, released_by = $2
      WHERE user_id = $1 AND status = 'ACTIVE';
    `, [userId, actorId]);

    await client.query(`
      INSERT INTO user_account_controls (control_id, user_id, account_state, reason, operator_id)
      VALUES ($1, $2, 'ACTIVE', $3, $4)
      ON CONFLICT (user_id) DO UPDATE SET
        account_state = 'ACTIVE',
        reason = EXCLUDED.reason,
        operator_id = EXCLUDED.operator_id,
        restricted_until = NULL,
        updated_at = CURRENT_TIMESTAMP;
    `, [`ctrl_${userId}_release_${Date.now()}`, userId, reason, actorId]);

    // 3. Audit Log
    await client.query(`
      INSERT INTO audit_events (actor_id, target_id, action, details)
      VALUES ($1, $2, 'ACCOUNT_RELEASED', $3);
    `, [actorId, userId, JSON.stringify({ reason })]);

    return { success: true, userId, status: 'ACTIVE' };
  });
}

/**
 * Betting-only hold — user cannot place bets until unhold.
 * Does not change profile to RESTRICTED (deposits/withdrawals stay allowed).
 */
export async function holdAccountBetting({
  userId,
  reason = 'Admin betting hold',
  actorId = 'ADMIN',
  expiresAt = null,
}) {
  return withTransaction(async (client) => {
    const existing = await client.query(
      `SELECT account_state FROM user_account_controls WHERE user_id = $1 FOR UPDATE`,
      [userId],
    );
    const prior = String(existing.rows[0]?.account_state || '').toUpperCase();
    if (['SUSPENDED', 'FROZEN', 'SELF_EXCLUDED', 'BLOCKED', 'UNDER_REVIEW', 'RESTRICTED_FROM_BETTING'].includes(prior)) {
      return {
        success: true,
        userId,
        status: prior,
        alreadyBlocked: true,
        message: `Account already blocked for betting (${prior})`,
      };
    }

    const controlId = `ctrl_hold_${userId}_${Date.now()}`;
    await client.query(
      `INSERT INTO user_account_controls (control_id, user_id, account_state, reason, category, operator_id, restricted_until)
       VALUES ($1, $2, 'BETTING_HOLD', $3, 'BETTING_HOLD', $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET
         account_state = 'BETTING_HOLD',
         reason = EXCLUDED.reason,
         category = 'BETTING_HOLD',
         operator_id = EXCLUDED.operator_id,
         restricted_until = EXCLUDED.restricted_until,
         updated_at = CURRENT_TIMESTAMP`,
      [controlId, userId, reason, actorId, expiresAt],
    );

    const restrictionId = `restr_hold_${userId}_${Date.now()}`;
    await client.query(
      `INSERT INTO account_restrictions (restriction_id, user_id, type, reason, status, created_by, expires_at)
       VALUES ($1, $2, 'BETTING_HOLD', $3, 'ACTIVE', $4, $5)`,
      [restrictionId, userId, reason, actorId, expiresAt],
    ).catch(() => null);

    await client.query(
      `INSERT INTO audit_events (actor_id, target_id, action, details)
       VALUES ($1, $2, 'ACCOUNT_BETTING_HOLD', $3)`,
      [actorId, userId, JSON.stringify({ reason, restrictionId })],
    ).catch(() => null);

    return { success: true, userId, status: 'ON_HOLD', restrictionId };
  });
}

/**
 * Clear betting hold (and clear control if it was BETTING_HOLD).
 * Full RESTRICTED accounts should use releaseAccount instead.
 */
export async function unholdAccountBetting({
  userId,
  actorId = 'ADMIN',
  reason = 'Admin betting unhold',
}) {
  return withTransaction(async (client) => {
    const current = await client.query(
      `SELECT account_state FROM user_account_controls WHERE user_id = $1`,
      [userId],
    );
    const state = String(current.rows[0]?.account_state || '').toUpperCase();
    if (state && state !== 'BETTING_HOLD' && state !== 'ON_HOLD' && state !== 'ACTIVE') {
      // Full restriction — use release path
      return releaseAccount({ userId, actorId, reason });
    }

    await client.query(
      `UPDATE account_restrictions
       SET status = 'RELEASED', released_at = CURRENT_TIMESTAMP, released_by = $2
       WHERE user_id = $1 AND status = 'ACTIVE' AND UPPER(type) = 'BETTING_HOLD'`,
      [userId, actorId],
    ).catch(() => null);

    await client.query(
      `INSERT INTO user_account_controls (control_id, user_id, account_state, reason, operator_id)
       VALUES ($1, $2, 'ACTIVE', $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET
         account_state = 'ACTIVE',
         reason = EXCLUDED.reason,
         category = NULL,
         operator_id = EXCLUDED.operator_id,
         restricted_until = NULL,
         updated_at = CURRENT_TIMESTAMP`,
      [`ctrl_unhold_${userId}_${Date.now()}`, userId, reason, actorId],
    );

    await client.query(
      `INSERT INTO audit_events (actor_id, target_id, action, details)
       VALUES ($1, $2, 'ACCOUNT_BETTING_UNHOLD', $3)`,
      [actorId, userId, JSON.stringify({ reason })],
    ).catch(() => null);

    return { success: true, userId, status: 'ACTIVE' };
  });
}

/**
 * Check if account is eligible to place bets or withdraw
 */
export async function checkAccountEligibility(userId) {
  const profileRes = await query(`
    SELECT account_status, kyc_status, risk_tier
    FROM user_profiles
    WHERE user_id = $1;
  `, [userId]);

  if (profileRes.rows.length === 0) {
    throw new Error('USER_NOT_FOUND: Profile record missing');
  }

  const profile = profileRes.rows[0];

  if (profile.account_status === 'RESTRICTED' || profile.account_status === 'SUSPENDED') {
    throw new Error(`ACCOUNT_RESTRICTED: Your account status is '${profile.account_status}'. Betting and withdrawals are currently blocked.`);
  }

  return { eligible: true, profile };
}
