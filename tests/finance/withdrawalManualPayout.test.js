import { describe, it, expect, beforeEach } from 'vitest';
import { normalizeManualPayoutProof } from '../../lib/withdrawalEngine.mjs';

describe('normalizeManualPayoutProof', () => {
  it('requires amount and UTR', () => {
    try {
      normalizeManualPayoutProof({ expectedAmount: 1500 });
      throw new Error('expected missing proof');
    } catch (err) {
      expect(err.code).toBe('PAYOUT_PROOF_REQUIRED');
    }
    try {
      normalizeManualPayoutProof({ payoutRef: '123456789012', expectedAmount: 1500 });
      throw new Error('expected missing amount');
    } catch (err) {
      expect(err.code).toBe('PAYOUT_AMOUNT_REQUIRED');
    }
  });

  it('rejects amount that does not match the request', () => {
    try {
      normalizeManualPayoutProof({
        paidAmount: 1400,
        payoutRef: '123456789012',
        expectedAmount: 1500,
      });
      throw new Error('expected mismatch');
    } catch (err) {
      expect(err.code).toBe('PAYOUT_AMOUNT_MISMATCH');
    }
  });

  it('normalizes UTR and accepts matching amount', () => {
    const proof = normalizeManualPayoutProof({
      paidAmount: '1500.00',
      payoutRef: '  abc123456789  ',
      expectedAmount: 1500,
    });
    expect(proof).toEqual({ paidAmount: 1500, payoutRef: 'ABC123456789' });
  });
});

const hasDb = Boolean(process.env.DATABASE_URL || process.env.PG_CONNECTION_STRING);

describe.runIf(hasDb)('Manual payout UTR on final approve', () => {
  let query;
  let withdrawalEngine;
  const userId = 'usr_wd_paid_utr';
  const walletId = 'wal_wd_paid_utr';

  beforeEach(async () => {
    ({ query } = await import('../../db/pg.js'));
    ({ withdrawalEngine } = await import('../../lib/withdrawalEngine.mjs'));
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1,$2,'h') ON CONFLICT DO NOTHING`, [
      userId, `${userId}@test.com`,
    ]);
    await query(`
      INSERT INTO user_profiles (user_id, account_status, kyc_status, date_of_birth)
      VALUES ($1, 'ACTIVE', 'VERIFIED', '1990-01-01')
      ON CONFLICT (user_id) DO UPDATE SET kyc_status = 'VERIFIED', account_status = 'ACTIVE'
    `, [userId]);
    await query(`DELETE FROM ledger_entries WHERE wallet_id = $1`, [walletId]);
    await query(`DELETE FROM transactions WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM withdrawals WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM wallets WHERE user_id = $1`, [userId]);
    await query(
      `INSERT INTO wallets (wallet_id, user_id, balance, reserved_balance, currency)
       VALUES ($1, $2, 5000, 1500, 'INR')`,
      [walletId, userId],
    );
  });

  async function seedPending(amount = 1500) {
    const wdId = `wd_paid_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await query(
      `INSERT INTO withdrawals (withdrawal_id, user_id, amount, currency, status, bank_details, created_at, risk_level)
       VALUES ($1, $2, $3, 'INR', 'PENDING_REVIEW', $4::jsonb, NOW(), 'LOW')`,
      [wdId, userId, amount, JSON.stringify({ method: 'UPI', upiId: 'paidtest@oksbi' })],
    );
    await query(
      `INSERT INTO transactions (transaction_id, user_id, type, amount, status, created_at)
       VALUES ($1, $2, 'WITHDRAWAL', $3, 'PENDING', NOW())
       ON CONFLICT DO NOTHING`,
      [`tx_${wdId}`, userId, amount],
    );
    return wdId;
  }

  it('rejects final Paid without UTR', async () => {
    const wdId = await seedPending();
    await expect(
      withdrawalEngine.reviewWithdrawal({
        withdrawalId: wdId,
        adminId: 'admin_pay',
        decision: 'APPROVE',
      }),
    ).rejects.toMatchObject({ code: 'PAYOUT_PROOF_REQUIRED' });
  });

  it('stores amount and UTR on Paid', async () => {
    const wdId = await seedPending();
    const utr = `UTR${Date.now()}ABCD`;
    const res = await withdrawalEngine.reviewWithdrawal({
      withdrawalId: wdId,
      adminId: 'admin_pay',
      decision: 'APPROVE',
      paidAmount: 1500,
      payoutRef: utr,
    });
    expect(res.status).toBe('APPROVED');
    expect(res.payoutRef).toBe(utr);
    const row = await query(
      `SELECT payout_id, bank_details, status FROM withdrawals WHERE withdrawal_id = $1`,
      [wdId],
    );
    expect(row.rows[0].payout_id).toBe(utr);
    expect(Number(row.rows[0].bank_details.paidAmount)).toBe(1500);
    const tx = await query(`SELECT status, utr FROM transactions WHERE transaction_id = $1`, [`tx_${wdId}`]);
    expect(tx.rows[0].status).toBe('SUCCESS');
    expect(tx.rows[0].utr).toBe(utr);
  });
});
