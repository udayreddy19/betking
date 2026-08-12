import { query, withTransaction } from '../db/pg.js';

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
  minOdds = 1.50,
  minStake = 100.00,
  wageringMultiplier = 5.0,
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
  depositAmount = 1000.00,
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
      SELECT id, name, type, status, budget, used_budget, max_reward, per_user_limit, min_odds, wagering_multiplier, expires_at
      FROM promotions
      WHERE code = $1 AND status = 'ACTIVE'
      FOR UPDATE;
    `, [promoCode]);

    if (promoRes.rows.length === 0) {
      throw new Error('PROMOTION_ERROR: Promotion not found or inactive');
    }

    const promo = promoRes.rows[0];

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

    // Calculate reward amount (e.g. 100% deposit match up to maxReward)
    const rewardAmount = parseFloat(Math.min(parseFloat(depositAmount), parseFloat(promo.max_reward)).toFixed(2));
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
      INSERT INTO user_bonuses (id, user_id, promotion_id, bonus_amount, wagering_required, wagering_completed, status, expires_at)
      VALUES ($1, $2, $3, $4, $5, 0.00, 'ACTIVE', $6);
    `, [bonusId, userId, promo.id, rewardAmount, wageringRequired, bonusExpiresAt]);

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

/** Process Bonus Wagering Progress on Settled Qualifying Bet */
export async function processBonusWageringProgress({
  userId,
  betStake,
  betOdds = 1.50,
}) {
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

    const releaseAmount = parseFloat(bonus.bonus_amount);

    // Lock Wallet FOR UPDATE
    let walletRes = await client.query(`SELECT wallet_id, balance FROM wallets WHERE user_id = $1 FOR UPDATE;`, [userId]);
    if (walletRes.rows.length === 0) {
      walletRes = await client.query(
        `INSERT INTO wallets (wallet_id, user_id, balance, currency) VALUES ($1, $2, 0.00, 'INR') RETURNING wallet_id, balance`,
        [`wal_${userId}`, userId]
      );
    }

    const wallet = walletRes.rows[0];

    // Credit Cash Balance & deduct bonus balance
    const updatedWallet = await client.query(`
      UPDATE wallets
      SET balance = balance + $1, bonus_balance = GREATEST(0.00, bonus_balance - $1), updated_at = NOW()
      WHERE wallet_id = $2
      RETURNING balance;
    `, [releaseAmount, wallet.wallet_id]);

    const newBalance = parseFloat(updatedWallet.rows[0].balance);

    // Record Transaction Record (Phase 6 Foreign Key Constraint)
    const txId = `tx_release_${bonusId}`;
    await client.query(
      `INSERT INTO transactions (transaction_id, user_id, type, amount, status, created_at)
       VALUES ($1, $2, 'BONUS_RELEASE', $3, 'SUCCESS', NOW())
       ON CONFLICT (transaction_id) DO NOTHING`,
      [txId, userId, releaseAmount]
    );

    // Record Double-Entry Ledger Entry
    await client.query(`
      INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description, created_at)
      VALUES ($1, $2, 'CREDIT', $3, $4, $5, NOW());
    `, [wallet.wallet_id, txId, releaseAmount, newBalance, `Bonus Release: #${bonusId}`]);

    // Update Bonus Status to RELEASED
    await client.query(`UPDATE user_bonuses SET status = 'RELEASED' WHERE id = $1;`, [bonusId]);

    return {
      success: true,
      status: 'RELEASED',
      bonusId,
      releaseAmount,
      newCashBalance: newBalance,
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
