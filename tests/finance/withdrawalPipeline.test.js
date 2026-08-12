import { describe, it, expect, beforeEach } from 'vitest';
import { withdrawalEngine } from '../../lib/withdrawalEngine.mjs';
import { query } from '../../db/pg.js';

describe('Phase 6 Withdrawal & Fund Reservation Security Tests', () => {
  const userId = 'usr_wdr_101';
  const walletId = 'w_wdr_101';

  beforeEach(async () => {
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT (user_id) DO NOTHING;`, [userId, `${userId}@example.com`]);
    await query(`DELETE FROM ledger_entries WHERE wallet_id IN (SELECT wallet_id FROM wallets WHERE user_id = $1);`, [userId]);
    await query(`DELETE FROM withdrawals WHERE user_id = $1;`, [userId]);
    await query(`DELETE FROM transactions WHERE user_id = $1;`, [userId]);
    await query(`DELETE FROM wallets WHERE user_id = $1;`, [userId]);
    await query(`INSERT INTO wallets (wallet_id, user_id, balance, reserved_balance, currency) VALUES ($1, $2, 500.00, 0.00, 'INR');`, [walletId, userId]);
  });

  it('should process valid withdrawal request and reserve funds', async () => {
    const res = await withdrawalEngine.requestWithdrawal({ userId, amount: 200.00, bankDetails: { account: '1234' } });
    expect(res.success).toBe(true);
    expect(res.status).toBe('PENDING_REVIEW');
    expect(res.reservedBalance).toBe(200.00);
    expect(res.availableBalance).toBe(300.00);

    const wRes = await query('SELECT balance, reserved_balance FROM wallets WHERE wallet_id = $1', [walletId]);
    expect(parseFloat(wRes.rows[0].balance)).toBe(500.00);
    expect(parseFloat(wRes.rows[0].reserved_balance)).toBe(200.00);
  });

  it('CRITICAL CONCURRENCY: 2 simultaneous ₹400 withdrawals on ₹500 balance -> ONE succeeds, ONE fails, balance = ₹500, reserved = ₹400', async () => {
    const results = await Promise.allSettled([
      withdrawalEngine.requestWithdrawal({ userId, amount: 400.00 }),
      withdrawalEngine.requestWithdrawal({ userId, amount: 400.00 }),
    ]);

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect(rejected[0].reason.message).toContain('INSUFFICIENT_FUNDS');

    const wRes = await query('SELECT balance, reserved_balance FROM wallets WHERE wallet_id = $1', [walletId]);
    expect(parseFloat(wRes.rows[0].balance)).toBe(500.00);
    expect(parseFloat(wRes.rows[0].reserved_balance)).toBe(400.00);
  });

  it('CRITICAL: admin rejection must REVERSE reserved funds via WITHDRAWAL_REVERSAL ledger entry', async () => {
    const reqRes = await withdrawalEngine.requestWithdrawal({ userId, amount: 300.00 });
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
    expect(parseFloat(wRes.rows[0].balance)).toBe(500.00);
    expect(parseFloat(wRes.rows[0].reserved_balance)).toBe(0.00); // Funds released!

    const lRes = await query('SELECT * FROM ledger_entries WHERE wallet_id = $1 AND description LIKE \'%Withdrawal Reversal%\'', [walletId]);
    expect(lRes.rows.length).toBe(1);
    expect(lRes.rows[0].type).toBe('CREDIT');
  });
});
