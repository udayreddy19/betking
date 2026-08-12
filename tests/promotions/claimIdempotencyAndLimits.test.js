import { describe, it, expect, beforeEach } from 'vitest';
import { createPromotion, claimPromotionBonus } from '../../lib/promotionsEngine.mjs';
import { query } from '../../db/pg.js';

describe('Phase 10 Promotion Claim Idempotency & Budget Safety Tests', () => {
  const userId = 'usr_claim_idem_101';
  let promoCode = `PROMO_IDEM_${Date.now()}`;

  beforeEach(async () => {
    promoCode = `PROMO_IDEM_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT (user_id) DO NOTHING;`, [userId, `${userId}@example.com`]);
    await query(`INSERT INTO user_profiles (user_id, account_status, kyc_status) VALUES ($1, 'ACTIVE', 'VERIFIED') ON CONFLICT (user_id) DO NOTHING;`, [userId]);
    await query(`INSERT INTO wallets (wallet_id, user_id, balance, bonus_balance, currency) VALUES ($1, $2, 5000.00, 0.00, 'INR') ON CONFLICT (wallet_id) DO NOTHING;`, [`wal_${userId}`, userId]);

    await query(`DELETE FROM user_bonuses WHERE user_id = $1;`, [userId]);

    await createPromotion({
      name: 'Idempotency Test Promo',
      code: promoCode,
      type: 'DEPOSIT_BONUS',
      budget: 500.00,
      maxReward: 100.00,
      wageringMultiplier: 3.0,
    });
  });

  it('CRITICAL: repeated claim request returns existing active bonus record (Idempotent)', async () => {
    const claim1 = await claimPromotionBonus({ userId, promoCode, depositAmount: 100.00 });
    expect(claim1.success).toBe(true);
    expect(claim1.alreadyClaimed).toBeUndefined();

    // Second claim call with same user and promo code
    const claim2 = await claimPromotionBonus({ userId, promoCode, depositAmount: 100.00 });
    expect(claim2.success).toBe(true);
    expect(claim2.alreadyClaimed).toBe(true);
    expect(claim2.bonusId).toBe(claim1.bonusId);

    // Verify only ONE bonus allocation in user_bonuses table
    const dbBonuses = await query('SELECT * FROM user_bonuses WHERE user_id = $1', [userId]);
    expect(dbBonuses.rows.length).toBe(1);
  });

  it('Budget Safety: attempting to claim when promotion budget is exhausted throws PROMOTION_ERROR', async () => {
    const smallPromoCode = `PROMO_SMALL_${Date.now()}`;
    await createPromotion({
      name: 'Exhaust Budget Promo',
      code: smallPromoCode,
      type: 'DEPOSIT_BONUS',
      budget: 50.00, // Budget only ₹50
      maxReward: 100.00,
    });

    await expect(claimPromotionBonus({ userId, promoCode: smallPromoCode, depositAmount: 100.00 })).rejects.toThrow('PROMOTION_ERROR: Promotion budget exhausted');
  });
});
