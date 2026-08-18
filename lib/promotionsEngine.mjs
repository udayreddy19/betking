import { query, withTransaction } from '../db/pg.js';
import { BONUS_MIN_BET_ODDS, BONUS_WAGERING_MULTIPLIER, bonusOddsQualify } from './promoRules.mjs';
import { getVerifiedIdentity, assertIdentityHasNotClaimedPromo } from './userIdentity.mjs';

/**
 * Server-Authoritative Enterprise Promotions & Bonus Engine
 * Budget row-level locking, server-side eligibility, wagering multiplier calculations,
 * atomic turnover capping, and Phase 6 wallet/ledger bonus release.
 */

/** Create a new Promotion */
export async function createPromotion({
  name,
  code,
  type = 'DEPOSIT_BONUS',
  budget = 100000.00,
  maxReward = 5000.00,
  perUserLimit = 1,
  minOdds = BONUS_MIN_BET_ODDS,
  minStake = 100.00,
  wageringMultiplier = BONUS_WAGERING_MULTIPLIER,
  durationDays = 30,
}) {
  const promoId = `promo_${code.toLowerCase()}_${Date.now()}`;
  const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();

  await query(`
    INSERT INTO promotions (id, name, code, type, status, budget, used_budget, max_reward, per_user_limit, min_odds, min_stake, wagering_multiplier, expires_at)
    VALUES ($1, $2, $3, $4, 'ACTIVE', $5, 0.00, $6, $7, $8, $9, $10, $11);
  `, [promoId, name, code, type, budget, maxReward, perUserLimit, minOdds, minStake, wageringMultiplier, expiresAt]);

  return { success: true, promoId, code, type, budget, maxReward, expiresAt };
}

/** Claim Promotion Bonus with Row Locking & Idempotency */
export async function claimPromotionBonus({
  userId,
  promoCode,
  depositAmount: _clientDepositAmount = 1000.00,
}) {
  return await withTransaction(async (client) => {
    // 1. Verify User Profile & KYC/Account Status (Phase 9 Integration)
    const userRes = await client.query(`
      SELECT account_status, kyc_status
      FROM user_profiles
      WHERE user_id = $1;
    `, [userId]);

    if (userRes.rows.length > 0 && userRes.rows[0].account_status !== 'ACTIVE') {
      throw new Error('PROMOTION_ERROR: Account is restricted or suspended');
    }

    // 2. Lock Promotion row for Budget Safety
    const promoRes = await client.query(`
      SELECT id, name, code, type, status, budget, used_budget, max_reward, per_user_limit,
             min_odds, min_stake, wagering_multiplier, match_percent, expires_at
      FROM promotions
      WHERE code = $1 AND status = 'ACTIVE'
      FOR UPDATE;
    `, [promoCode]);

    if (promoRes.rows.length === 0) {
      throw new Error('PROMOTION_ERROR: Promotion not found or inactive');
    }

    const promo = promoRes.rows[0];
    const identity = await getVerifiedIdentity(userId, client);
    if (identity) {
      await assertIdentityHasNotClaimedPromo({
        exec: client,
        promotionId: promo.id,
        panHash: identity.panHash,
        aadhaarHash: identity.aadhaarHash,
        excludeUserId: userId,
      });
    }

    // Idempotency Check: Existing active bonus for this user and promo
    const activeBonusRes = await client.query(`
      SELECT id, bonus_amount, wagering_required, wagering_completed, status
      FROM user_bonuses
      WHERE user_id = $1 AND promotion_id = $2 AND status IN ('ACTIVE', 'COMPLETED', 'RELEASED');
    `, [userId, promo.id]);

    if (activeBonusRes.rows.length > 0) {
      const existing = activeBonusRes.rows[0];
      return {
        success: true,
        alreadyClaimed: true,
        bonusId: existing.id,
        rewardAmount: parseFloat(existing.bonus_amount),
        wageringRequired: parseFloat(existing.wagering_required),
        status: existing.status,
      };
    }

    // Match against a real completed deposit — never trust a client-supplied amount.
    const minStake = parseFloat(promo.min_stake) || 0;
    const depositRes = await client.query(
      `SELECT amount FROM transactions
       WHERE user_id = $1
         AND type = 'DEPOSIT'
         AND status IN ('SUCCESS', 'COMPLETED')
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId],
    );
    if (depositRes.rows.length === 0) {
      throw new Error('PROMOTION_ERROR: Deposit first to claim this bonus');
    }
    const deposit = parseFloat(depositRes.rows[0].amount) || 0;
    if (minStake > 0 && deposit < minStake) {
      throw new Error(`PROMOTION_ERROR: Deposit at least ₹${minStake.toFixed(0)} to claim this bonus`);
    }
    if (String(promo.code || promoCode).toUpperCase() === 'WELCOME150') {
      const depositCount = await client.query(
        `SELECT COUNT(*)::int AS n FROM transactions
         WHERE user_id = $1 AND type = 'DEPOSIT' AND status IN ('SUCCESS', 'COMPLETED')`,
        [userId],
      );
      if (Number(depositCount.rows[0]?.n || 0) !== 1) {
        throw new Error('PROMOTION_ERROR: WELCOME150 applies to your first deposit only');
      }
    }

    const maxReward = parseFloat(promo.max_reward);
    const matchPercent = promo.match_percent == null ? null : parseFloat(promo.match_percent);
    const rewardAmount = parseFloat(
      (matchPercent != null
        ? Math.min(deposit * (matchPercent / 100), maxReward)
        : Math.min(deposit, maxReward)
      ).toFixed(2),
    );
    const usedBudget = parseFloat(promo.used_budget);
    const totalBudget = parseFloat(promo.budget);

    if (usedBudget + rewardAmount > totalBudget) {
      throw new Error('PROMOTION_ERROR: Promotion budget exhausted');
    }

    // Update used budget
    await client.query(`
      UPDATE promotions SET used_budget = used_budget + $1 WHERE id = $2;
    `, [rewardAmount, promo.id]);

    // Create User Bonus Record with Wagering Requirement
    const bonusId = `ubonus_${userId}_${Date.now()}`;
    const wageringRequired = parseFloat((rewardAmount * parseFloat(promo.wagering_multiplier)).toFixed(2));
    const bonusExpiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    await client.query(`
      INSERT INTO user_bonuses (
        id, user_id, promotion_id, bonus_amount, wagering_required, wagering_completed, status, expires_at, pan_hash, aadhaar_hash
      )
      VALUES ($1, $2, $3, $4, $5, 0.00, 'ACTIVE', $6, $7, $8);
    `, [
      bonusId,
      userId,
      promo.id,
      rewardAmount,
      wageringRequired,
      bonusExpiresAt,
      identity?.panHash || null,
      identity?.aadhaarHash || null,
    ]);

    // Update Wallet Bonus Balance
    const walletRes = await client.query(`
      UPDATE wallets
      SET bonus_balance = bonus_balance + $1, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $2
      RETURNING wallet_id, balance, bonus_balance;
    `, [rewardAmount, userId]);

    const wallet = walletRes.rows.length > 0 ? walletRes.rows[0] : { wallet_id: `wal_${userId}`, balance: 0.00, bonus_balance: rewardAmount };

    // Record Double-Entry Ledger Entry
    await client.query(`
      INSERT INTO ledger_entries (wallet_id, type, amount, balance_after, description)
      VALUES ($1, 'CREDIT', $2, $3, $4);
    `, [wallet.wallet_id, rewardAmount, wallet.balance, `Bonus Claimed: ${promo.name}`]);

    return {
      success: true,
      bonusId,
      promoCode,
      rewardAmount,
      wageringRequired,
      bonusBalance: parseFloat(wallet.bonus_balance || rewardAmount),
      status: 'ACTIVE',
    };
  });
}

export async function hasIncompleteBonusWagering(userId, exec = query) {
  const run = typeof exec === 'function' ? exec : exec.query.bind(exec);
  const res = await run(
    `SELECT id FROM user_bonuses
     WHERE user_id = $1 AND status = 'ACTIVE'
     LIMIT 1`,
    [userId],
  );
  return res.rows.length > 0;
}

/** Process Bonus Wagering Progress on Settled Qualifying Bet */
export async function processBonusWageringProgress({
  userId,
  betStake,
  betOdds = BONUS_MIN_BET_ODDS,
  fundSource = 'cash',
}) {
  if (fundSource === 'freebet') return { updated: false, skipped: 'freebet' };
  if (!bonusOddsQualify(betOdds)) {
    return { updated: false, skipped: 'odds', minOdds: BONUS_MIN_BET_ODDS };
  }

  const activeBonuses = await query(`
    SELECT id, bonus_amount, wagering_required, wagering_completed
    FROM user_bonuses
    WHERE user_id = $1 AND status = 'ACTIVE'
    ORDER BY created_at ASC;
  `, [userId]);

  if (activeBonuses.rows.length === 0) return { updated: false };

  const bonus = activeBonuses.rows[0];
  const required = parseFloat(bonus.wagering_required);
  const currentCompleted = parseFloat(bonus.wagering_completed);

  // Cap completed wagering at required amount
  const stake = parseFloat(betStake);
  const newCompleted = parseFloat(Math.min(required, currentCompleted + stake).toFixed(2));
  const isCompleted = newCompleted >= required;

  await query(`
    UPDATE user_bonuses
    SET wagering_completed = $1, status = CASE WHEN $2 = true THEN 'COMPLETED' ELSE status END
    WHERE id = $3;
  `, [newCompleted, isCompleted, bonus.id]);

  return {
    updated: true,
    bonusId: bonus.id,
    wageringCompleted: newCompleted,
    wageringRequired: required,
    remainingWagering: parseFloat(Math.max(0.00, required - newCompleted).toFixed(2)),
    isCompleted,
  };
}

/** Release Completed Bonus Funds to Cash Balance (Atomic Phase 6 Transaction) */
export async function releaseCompletedBonus({ userId, bonusId }) {
  return await withTransaction(async (client) => {
    const bonusRes = await client.query(`
      SELECT id, bonus_amount, wagering_required, wagering_completed, status
      FROM user_bonuses
      WHERE id = $1 AND user_id = $2 FOR UPDATE;
    `, [bonusId, userId]);

    if (bonusRes.rows.length === 0) {
      throw new Error(`Bonus ${bonusId} not found`);
    }

    const bonus = bonusRes.rows[0];

    if (bonus.status === 'RELEASED') {
      return { success: true, status: 'ALREADY_RELEASED', bonusId, amount: parseFloat(bonus.bonus_amount) };
    }

    const completed = parseFloat(bonus.wagering_completed);
    const required = parseFloat(bonus.wagering_required);

    if (completed < required && bonus.status !== 'COMPLETED') {
      throw new Error(`INCOMPLETE_WAGERING: Required: ₹${required}, Completed: ₹${completed}. Bonus cannot be released.`);
    }

    const bonusAmount = parseFloat(bonus.bonus_amount);

    // Playthrough complete: unlock cash winnings. Bonus itself is never converted to cash.
    await client.query(`UPDATE user_bonuses SET status = 'RELEASED' WHERE id = $1;`, [bonusId]);

    const walletRes = await client.query(
      `SELECT wallet_id, balance, bonus_balance FROM wallets WHERE user_id = $1`,
      [userId],
    );
    const wallet = walletRes.rows[0] || { balance: 0, bonus_balance: 0 };

    return {
      success: true,
      status: 'RELEASED',
      bonusId,
      releaseAmount: 0,
      bonusAmount,
      newCashBalance: parseFloat(wallet.balance || 0),
      bonusBalance: parseFloat(wallet.bonus_balance || 0),
    };
  });
}

/** Expire Stale Bonuses Background Worker */
export async function expireStaleBonuses() {
  const expiredRes = await query(`
    SELECT ub.id, ub.user_id, ub.bonus_amount, w.wallet_id
    FROM user_bonuses ub
    JOIN wallets w ON ub.user_id = w.user_id
    WHERE ub.status = 'ACTIVE' AND ub.expires_at < CURRENT_TIMESTAMP;
  `);

  let count = 0;
  for (const row of expiredRes.rows) {
    await query(`UPDATE user_bonuses SET status = 'EXPIRED' WHERE id = $1;`, [row.id]);
    await query(`UPDATE wallets SET bonus_balance = GREATEST(0.00, bonus_balance - $1) WHERE user_id = $2;`, [row.bonus_amount, row.user_id]);
    count++;
  }

  return { success: true, countExpired: count };
}
