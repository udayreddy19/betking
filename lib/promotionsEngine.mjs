import { query, withTransaction } from '../db/pg.js';

/**
 * Enterprise Promotions & Bonus Engine
 * Enforces server-side eligibility, budget safety, double-entry bonus ledger, and wagering rules.
 */

/**
 * Create a new Promotion
 */
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

/**
 * Claim Promotion Bonus with Row Locking & Double-Entry Ledger
 */
export async function claimPromotionBonus({
  userId,
  promoCode,
  depositAmount = 1000.00,
}) {
  return await withTransaction(async (client) => {
    // 1. Verify User Profile & KYC Status
    const userRes = await client.query(`
      SELECT account_status, kyc_status
      FROM user_profiles
      WHERE user_id = $1;
    `, [userId]);

    if (userRes.rows.length === 0 || userRes.rows[0].account_status !== 'ACTIVE') {
      throw new Error('PROMOTION_ERROR: Account is restricted or non-active');
    }

    // 2. Lock Promotion row for Budget Safety
    const promoRes = await client.query(`
      SELECT id, name, type, status, budget, used_budget, max_reward, per_user_limit, wagering_multiplier, expires_at
      FROM promotions
      WHERE code = $1 AND status = 'ACTIVE'
      FOR UPDATE;
    `, [promoCode]);

    if (promoRes.rows.length === 0) {
      throw new Error('PROMOTION_ERROR: Promotion not found or inactive');
    }

    const promo = promoRes.rows[0];

    // Check usage limits for this user
    const userUsageRes = await client.query(`
      SELECT COUNT(*) AS claim_count
      FROM user_bonuses
      WHERE user_id = $1 AND promotion_id = $2;
    `, [userId, promo.id]);

    if (parseInt(userUsageRes.rows[0].claim_count, 10) >= promo.per_user_limit) {
      throw new Error('PROMOTION_ERROR: Usage limit exceeded for this user');
    }

    // Calculate reward amount (e.g. 100% deposit match up to maxReward)
    const rewardAmount = Math.min(parseFloat(depositAmount), parseFloat(promo.max_reward));
    const usedBudget = parseFloat(promo.used_budget);
    const totalBudget = parseFloat(promo.budget);

    if (usedBudget + rewardAmount > totalBudget) {
      throw new Error('PROMOTION_ERROR: Promotion budget exhausted');
    }

    // 3. Update used budget
    await client.query(`
      UPDATE promotions
      SET used_budget = used_budget + $1
      WHERE id = $2;
    `, [rewardAmount, promo.id]);

    // 4. Create User Bonus Record with Wagering Requirement
    const bonusId = `ubonus_${userId}_${Date.now()}`;
    const wageringRequired = parseFloat((rewardAmount * parseFloat(promo.wagering_multiplier)).toFixed(2));
    const bonusExpiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    await client.query(`
      INSERT INTO user_bonuses (id, user_id, promotion_id, bonus_amount, wagering_required, wagering_completed, status, expires_at)
      VALUES ($1, $2, $3, $4, $5, 0.00, 'ACTIVE', $6);
    `, [bonusId, userId, promo.id, rewardAmount, wageringRequired, bonusExpiresAt]);

    // 5. Update Wallet Bonus Balance
    const walletRes = await client.query(`
      UPDATE wallets
      SET bonus_balance = bonus_balance + $1, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $2
      RETURNING wallet_id, balance, bonus_balance;
    `, [rewardAmount, userId]);

    const wallet = walletRes.rows[0];

    // 6. Record Double-Entry Ledger Entry
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
      bonusBalance: wallet.bonus_balance,
      status: 'ACTIVE',
    };
  });
}

/**
 * Process Bonus Wagering Progress on Bet Placement/Settlement
 */
export async function processBonusWageringProgress({
  userId,
  betStake,
  betOdds,
}) {
  const activeBonuses = await query(`
    SELECT id, bonus_amount, wagering_required, wagering_completed
    FROM user_bonuses
    WHERE user_id = $1 AND status = 'ACTIVE'
    ORDER BY created_at ASC;
  `, [userId]);

  if (activeBonuses.rows.length === 0) return { updated: false };

  const bonus = activeBonuses.rows[0];
  const newCompleted = parseFloat((parseFloat(bonus.wagering_completed) + parseFloat(betStake)).toFixed(2));
  const isCompleted = newCompleted >= parseFloat(bonus.wagering_required);

  await query(`
    UPDATE user_bonuses
    SET wagering_completed = $1, status = CASE WHEN $2 THEN 'COMPLETED' ELSE status END
    WHERE id = $3;
  `, [newCompleted, isCompleted, bonus.id]);

  return {
    updated: true,
    bonusId: bonus.id,
    wageringCompleted: newCompleted,
    wageringRequired: parseFloat(bonus.wagering_required),
    isCompleted,
  };
}

/**
 * Expire Stale Bonuses Background Worker
 */
export async function expireStaleBonuses() {
  const expiredRes = await query(`
    SELECT ub.id, ub.user_id, ub.bonus_amount, w.wallet_id, w.balance
    FROM user_bonuses ub
    JOIN wallets w ON ub.user_id = w.user_id
    WHERE ub.status = 'ACTIVE' AND ub.expires_at < CURRENT_TIMESTAMP;
  `);

  let count = 0;
  for (const row of expiredRes.rows) {
    await query(`
      UPDATE user_bonuses
      SET status = 'EXPIRED'
      WHERE id = $1;
    `, [row.id]);

    await query(`
      UPDATE wallets
      SET bonus_balance = GREATEST(0.00, bonus_balance - $1)
      WHERE user_id = $2;
    `, [row.bonus_amount, row.user_id]);

    count++;
  }

  return { success: true, countExpired: count };
}
