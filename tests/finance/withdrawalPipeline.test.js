import { describe, it, expect, beforeEach } from 'vitest';
import { withdrawalEngine } from '../../lib/withdrawalEngine.mjs';
import { query } from '../../db/pg.js';

describe('Phase 6 Withdrawal & Fund Reservation Security Tests', () => {
  const userId = 'usr_wdr_101';
  const walletId = 'w_wdr_101';
  const upiBank = { method: 'UPI', upiId: 'pipeline@oksbi', details: 'UPI ID: pipeline@oksbi' };

  beforeEach(async () => {
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT (user_id) DO NOTHING;`, [userId, `${userId}@example.com`]);
    await query(`
      INSERT INTO user_profiles (user_id, account_status, kyc_status, date_of_birth)
      VALUES ($1, 'ACTIVE', 'VERIFIED', '1990-01-01')
      ON CONFLICT (user_id) DO UPDATE SET kyc_status = 'VERIFIED', account_status = 'ACTIVE', date_of_birth = '1990-01-01';
    `, [userId]);
    await query(`DELETE FROM kyc_cases WHERE user_id = $1;`, [userId]);
    await query(`
      INSERT INTO kyc_cases (case_id, user_id, status, pan_number, aadhaar_number, updated_at)
      VALUES ($1, $2, 'VERIFIED', 'WDRWL1234A', '900011112222', NOW())
      ON CONFLICT (case_id) DO UPDATE SET status = 'VERIFIED', pan_number = EXCLUDED.pan_number, aadhaar_number = EXCLUDED.aadhaar_number;
    `, [`kyc_${userId}`, userId]);
    await query(`DELETE FROM user_bonuses WHERE user_id = $1;`, [userId]);
    await query(`DELETE FROM ledger_entries WHERE wallet_id IN (SELECT wallet_id FROM wallets WHERE user_id = $1);`, [userId]);
    await query(`DELETE FROM withdrawals WHERE user_id = $1;`, [userId]);
    await query(`DELETE FROM deposits WHERE user_id = $1;`, [userId]);
    await query(`DELETE FROM wallets WHERE user_id = $1;`, [userId]);
    await query(`INSERT INTO wallets (wallet_id, user_id, balance, reserved_balance, winnings_balance, currency) VALUES ($1, $2, 5000.00, 0.00, 5000.00, 'INR');`, [walletId, userId]);
    await query(`INSERT INTO deposits (id, deposit_id, user_id, order_id, amount, refunded_amount, status, created_at)
                 VALUES ($1, $1, $2, $1, 5000.00, 0.00, 'COMPLETED', NOW() - INTERVAL '3 hours')
                 ON CONFLICT DO NOTHING;`, [`dep_${userId}_setup`, userId]);
    await query(`INSERT INTO transactions (transaction_id, user_id, type, amount, status, created_at)
                 VALUES ($1, $2, 'DEPOSIT', 5000.00, 'SUCCESS', NOW() - INTERVAL '3 hours')
                 ON CONFLICT DO NOTHING;`, [`tx_dep_${userId}`, userId]);
  });

  it('should process valid withdrawal request and reserve funds', async () => {
    const res = await withdrawalEngine.requestWithdrawal({ userId, amount: 2000.00, bankDetails: upiBank });
    expect(res.success).toBe(true);
    expect(res.status).toBe('PENDING_REVIEW');
    expect(res.reservedBalance).toBe(2000.00);
    expect(res.availableBalance).toBe(3000.00);

    const wRes = await query('SELECT balance, reserved_balance FROM wallets WHERE wallet_id = $1', [walletId]);
    expect(parseFloat(wRes.rows[0].balance)).toBe(3000.00);
    expect(parseFloat(wRes.rows[0].reserved_balance)).toBe(2000.00);
  });

  it('CRITICAL CONCURRENCY: 2 simultaneous ₹4000 withdrawals on ₹5000 balance -> ONE succeeds, ONE fails, balance = ₹5000, reserved = ₹4000', async () => {
    const results = await Promise.allSettled([
      withdrawalEngine.requestWithdrawal({ userId, amount: 4000.00, bankDetails: upiBank }),
      withdrawalEngine.requestWithdrawal({ userId, amount: 4000.00, bankDetails: upiBank }),
    ]);

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect(rejected[0].reason.message).toContain('INSUFFICIENT_FUNDS');

    const wRes = await query('SELECT balance, reserved_balance FROM wallets WHERE wallet_id = $1', [walletId]);
    expect(parseFloat(wRes.rows[0].balance)).toBe(1000.00);
    expect(parseFloat(wRes.rows[0].reserved_balance)).toBe(4000.00);
  });

  it('CRITICAL: admin rejection must REVERSE reserved funds via WITHDRAWAL_REVERSAL ledger entry', async () => {
    const reqRes = await withdrawalEngine.requestWithdrawal({ userId, amount: 3000.00, bankDetails: upiBank });
    const withdrawalId = reqRes.withdrawalId;

    const revRes = await withdrawalEngine.reviewWithdrawal({
      withdrawalId,
      adminId: 'admin_super',
      decision: 'REJECT',
      reason: 'Failed Risk Check',
    });

    expect(revRes.success).toBe(true);
    expect(revRes.status).toBe('REJECTED');

    const wRes = await query('SELECT balance, reserved_balance FROM wallets WHERE wallet_id = $1', [walletId]);
    expect(parseFloat(wRes.rows[0].balance)).toBe(5000.00);
    expect(parseFloat(wRes.rows[0].reserved_balance)).toBe(0.00); // Funds released!

    const lRes = await query('SELECT * FROM ledger_entries WHERE wallet_id = $1 AND description LIKE \'%Withdrawal Reversal%\'', [walletId]);
    expect(lRes.rows.length).toBe(1);
    expect(lRes.rows[0].type).toBe('CREDIT');
  });

  it('rejects withdrawals below ₹1,000', async () => {
    await expect(
      withdrawalEngine.requestWithdrawal({ userId, amount: 500.00, bankDetails: upiBank }),
    ).rejects.toThrow(/Minimum withdrawal amount is ₹1000/);
  });

  it('requires verified Aadhaar and PAN before withdrawal', async () => {
    await query(`DELETE FROM kyc_cases WHERE user_id = $1;`, [userId]);
    await expect(
      withdrawalEngine.requestWithdrawal({ userId, amount: 200.00, bankDetails: upiBank }),
    ).rejects.toThrow('KYC_REQUIRED');
  });

  it('forfeits remaining bonus when winnings are withdrawn', async () => {
    await query(`UPDATE wallets SET bonus_balance = 150.00 WHERE wallet_id = $1`, [walletId]);
    const promoCode = `WDRTEST${Date.now()}`;
    const promoId = `promo_wdr_${Date.now()}`;
    await query(`
      INSERT INTO promotions (id, name, code, type, status, budget, max_reward, wagering_multiplier, min_odds)
      VALUES ($1, 'Wdr Test', $2, 'DEPOSIT_BONUS', 'ACTIVE', 10000, 100, 5, 1.75)
    `, [promoId, promoCode]);
    await query(`
      INSERT INTO user_bonuses (id, user_id, promotion_id, bonus_amount, wagering_required, wagering_completed, status)
      VALUES ($1, $2, $3, 150.00, 750.00, 0.00, 'ACTIVE')
    `, [`ubonus_${userId}`, userId, promoId]);

    const res = await withdrawalEngine.requestWithdrawal({ userId, amount: 2000.00, bankDetails: upiBank });
    expect(res.success).toBe(true);
    expect(res.forfeitedBonus).toBe(150);

    const wRes = await query('SELECT bonus_balance, reserved_balance FROM wallets WHERE wallet_id = $1', [walletId]);
    expect(parseFloat(wRes.rows[0].bonus_balance)).toBe(0);
    expect(parseFloat(wRes.rows[0].reserved_balance)).toBe(2000);

    const bonusRes = await query('SELECT status FROM user_bonuses WHERE user_id = $1', [userId]);
    expect(bonusRes.rows[0].status).toBe('FORFEITED');
  });

  it('lists PENDING_REVIEW withdrawals for cancel UI and user cancel restores funds', async () => {
    const reqRes = await withdrawalEngine.requestWithdrawal({ userId, amount: 1500.00, bankDetails: upiBank });
    const listed = await withdrawalEngine.listCancellableWithdrawals(userId);
    expect(listed.count).toBe(1);
    expect(listed.withdrawals[0].id).toBe(reqRes.withdrawalId);
    expect(listed.withdrawals[0].status).toBe('PENDING_REVIEW');

    const cancelRes = await withdrawalEngine.cancelWithdrawal({
      userId,
      withdrawalId: reqRes.withdrawalId,
    });
    expect(cancelRes.success).toBe(true);
    expect(cancelRes.status).toBe('CANCELLED');

    const wRes = await query('SELECT balance, reserved_balance FROM wallets WHERE wallet_id = $1', [walletId]);
    expect(parseFloat(wRes.rows[0].balance)).toBe(5000.00);
    expect(parseFloat(wRes.rows[0].reserved_balance)).toBe(0.00);

    const after = await withdrawalEngine.listCancellableWithdrawals(userId);
    expect(after.count).toBe(0);

    await expect(
      withdrawalEngine.cancelWithdrawal({ userId, withdrawalId: reqRes.withdrawalId }),
    ).rejects.toThrow(/NOT_CANCELLABLE|already/);
  });

  it('refuses cancel for another user\'s withdrawal', async () => {
    const reqRes = await withdrawalEngine.requestWithdrawal({ userId, amount: 1200.00, bankDetails: upiBank });
    await expect(
      withdrawalEngine.cancelWithdrawal({ userId: 'usr_other', withdrawalId: reqRes.withdrawalId }),
    ).rejects.toThrow(/FORBIDDEN/);
  });
});
