import { describe, it, expect, beforeEach } from 'vitest';
import { createPromotion, claimPromotionBonus, processBonusWageringProgress, releaseCompletedBonus } from '../../lib/promotionsEngine.mjs';
import { query } from '../../db/pg.js';

describe('Phase 10 Mandatory 5x Wagering & Incomplete Release Guard Tests', () => {
  const userId = 'usr_wag_5x_101';
  let promoCode = `PROMO_5X_${Date.now()}`;

  beforeEach(async () => {
    promoCode = `PROMO_5X_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT (user_id) DO NOTHING;`, [userId, `${userId}@example.com`]);
    await query(`INSERT INTO user_profiles (user_id, account_status, kyc_status) VALUES ($1, 'ACTIVE', 'VERIFIED') ON CONFLICT (user_id) DO NOTHING;`, [userId]);
    await query(`INSERT INTO wallets (wallet_id, user_id, balance, bonus_balance, currency) VALUES ($1, $2, 5000.00, 0.00, 'INR') ON CONFLICT (wallet_id) DO NOTHING;`, [`wal_${userId}`, userId]);

    await query(`DELETE FROM user_bonuses WHERE user_id = $1;`, [userId]);
    await query(`DELETE FROM ledger_entries WHERE wallet_id = $1;`, [`wal_${userId}`]);

    await createPromotion({
      name: '5x Wagering Test Promo',
      code: promoCode,
      type: 'WELCOME_BONUS',
      budget: 100000.00,
      maxReward: 100.00,
      wageringMultiplier: 5.0,
    });
  });

  it('MANDATORY TEST 1: 5x Wagering Requirement -> ₹100 bonus + ₹500 turnover -> COMPLETED -> Atomic Cash Release', async () => {
    // 1. Claim ₹100 Bonus with 5x multiplier (Required: ₹500.00)
    const claim = await claimPromotionBonus({ userId, promoCode, depositAmount: 100.00 });
    expect(claim.rewardAmount).toBe(100.00);
    expect(claim.wageringRequired).toBe(500.00);
    expect(claim.status).toBe('ACTIVE');

    const bonusId = claim.bonusId;

    // 2. Process Bet 1: ₹100.00 qualifying stake (Progress: ₹100 / ₹500)
    const p1 = await processBonusWageringProgress({ userId, betStake: 100.00, betOdds: 1.80 });
    expect(p1.wageringCompleted).toBe(100.00);
    expect(p1.isCompleted).toBe(false);

    // 3. Process Bet 2: ₹150.00 qualifying stake (Progress: ₹250 / ₹500)
    const p2 = await processBonusWageringProgress({ userId, betStake: 150.00, betOdds: 1.80 });
    expect(p2.wageringCompleted).toBe(250.00);
    expect(p2.isCompleted).toBe(false);

    // 4. Process Bet 3: ₹250.00 qualifying stake (Progress: ₹500 / ₹500) -> Requirement Satisfied!
    const p3 = await processBonusWageringProgress({ userId, betStake: 250.00, betOdds: 1.80 });
    expect(p3.wageringCompleted).toBe(500.00);
    expect(p3.isCompleted).toBe(true);

    const dbBonus = await query('SELECT status FROM user_bonuses WHERE id = $1', [bonusId]);
    expect(dbBonus.rows[0].status).toBe('COMPLETED');

    // 5. Release Bonus Funds to Cash Wallet
    const initialWal = await query('SELECT balance FROM wallets WHERE user_id = $1', [userId]);
    const initialBal = parseFloat(initialWal.rows[0].balance);

    const releaseRes = await releaseCompletedBonus({ userId, bonusId });
    expect(releaseRes.success).toBe(true);
    expect(releaseRes.status).toBe('RELEASED');
    expect(releaseRes.releaseAmount).toBe(100.00);
    expect(releaseRes.newCashBalance).toBe(initialBal + 100.00);

    // Verify double-entry ledger record
    const dbLedger = await query('SELECT * FROM ledger_entries WHERE wallet_id = $1 AND description LIKE \'%Bonus Release%\'', [`wal_${userId}`]);
    expect(dbLedger.rows.length).toBe(1);
    expect(parseFloat(dbLedger.rows[0].amount)).toBe(100.00);

    // Verify Idempotent Second Release Request -> Returns ALREADY_RELEASED without duplicate credit
    const secondRelease = await releaseCompletedBonus({ userId, bonusId });
    expect(secondRelease.status).toBe('ALREADY_RELEASED');
  });

  it('MANDATORY TEST 2: Incomplete Wagering Guard -> ₹499 turnover on ₹500 requirement MUST BE REJECTED', async () => {
    const claim = await claimPromotionBonus({ userId, promoCode, depositAmount: 100.00 });
    const bonusId = claim.bonusId;

    // Process ₹499.00 turnover (₹1.00 short of ₹500 requirement)
    await processBonusWageringProgress({ userId, betStake: 499.00, betOdds: 1.80 });

    const dbBonus = await query('SELECT wagering_completed, status FROM user_bonuses WHERE id = $1', [bonusId]);
    expect(parseFloat(dbBonus.rows[0].wagering_completed)).toBe(499.00);
    expect(dbBonus.rows[0].status).toBe('ACTIVE');

    // Release Attempt MUST BE REJECTED
    await expect(releaseCompletedBonus({ userId, bonusId })).rejects.toThrow('INCOMPLETE_WAGERING');
  });

  it('MANDATORY TEST 3: Over-wagering turnover (₹600 on ₹500 requirement) caps progress at ₹500 and releases cleanly', async () => {
    const claim = await claimPromotionBonus({ userId, promoCode, depositAmount: 100.00 });
    const bonusId = claim.bonusId;

    // Process ₹600.00 turnover
    const res = await processBonusWageringProgress({ userId, betStake: 600.00, betOdds: 1.80 });
    expect(res.wageringCompleted).toBe(500.00); // Capped at required ₹500.00
    expect(res.isCompleted).toBe(true);

    const releaseRes = await releaseCompletedBonus({ userId, bonusId });
    expect(releaseRes.status).toBe('RELEASED');
  });
});
