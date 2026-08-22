import { describe, it, expect, beforeEach } from 'vitest';
import { query } from '../../db/pg.js';
import { withdrawalEngine } from '../../lib/withdrawalEngine.mjs';

describe('Withdrawal review concurrency / CAS', () => {
  const userId = 'usr_wd_race';
  const walletId = 'wal_wd_race';
  const withdrawalId = `wd_race_${Date.now()}`;

  beforeEach(async () => {
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT DO NOTHING`, [
      userId,
      `${userId}@test.com`,
    ]);
    await query(`DELETE FROM ledger_entries WHERE wallet_id = $1`, [walletId]);
    await query(`DELETE FROM transactions WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM withdrawals WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM wallets WHERE user_id = $1`, [userId]);
    await query(
      `INSERT INTO wallets (wallet_id, user_id, balance, reserved_balance, currency)
       VALUES ($1, $2, 500, 200, 'INR')`,
      [walletId, userId],
    );
    await query(
      `INSERT INTO withdrawals (withdrawal_id, user_id, amount, status, created_at)
       VALUES ($1, $2, 200, 'PENDING_REVIEW', NOW())
       ON CONFLICT (withdrawal_id) DO UPDATE SET status = 'PENDING_REVIEW', amount = 200`,
      [withdrawalId, userId],
    );
    await query(
      `INSERT INTO transactions (transaction_id, user_id, type, amount, status, created_at)
       VALUES ($1, $2, 'WITHDRAWAL', 200, 'PENDING', NOW())
       ON CONFLICT (transaction_id) DO NOTHING`,
      [`tx_${withdrawalId}`, userId],
    );
  });

  it('concurrent APPROVE + REJECT → exactly one terminal outcome; no double credit', async () => {
    const results = await Promise.allSettled([
      withdrawalEngine.reviewWithdrawal({
        withdrawalId,
        adminId: 'admin_a',
        decision: 'APPROVE',
      }),
      withdrawalEngine.reviewWithdrawal({
        withdrawalId,
        adminId: 'admin_b',
        decision: 'REJECT',
        reason: 'race',
      }),
    ]);

    const ok = results.filter((r) => r.status === 'fulfilled');
    const fail = results.filter((r) => r.status === 'rejected');
    expect(ok.length).toBe(1);
    expect(fail.length).toBe(1);

    const w = await query(`SELECT status FROM withdrawals WHERE withdrawal_id = $1`, [withdrawalId]);
    expect(['APPROVED', 'REJECTED']).toContain(w.rows[0].status);

    const wallet = await query(
      `SELECT balance, reserved_balance FROM wallets WHERE wallet_id = $1`,
      [walletId],
    );
    const bal = Number(wallet.rows[0].balance);
    const reserved = Number(wallet.rows[0].reserved_balance);
    // Start 500 bal / 200 reserved. Approve → bal 500 reserved 0. Reject → bal 700 reserved 0.
    if (w.rows[0].status === 'APPROVED') {
      expect(bal).toBe(500);
      expect(reserved).toBe(0);
    } else {
      expect(bal).toBe(700);
      expect(reserved).toBe(0);
    }

    const revCredits = await query(
      `SELECT COUNT(*)::int AS c FROM ledger_entries WHERE wallet_id = $1 AND transaction_id = $2`,
      [walletId, `tx_rev_${withdrawalId}`],
    );
    if (w.rows[0].status === 'REJECTED') {
      expect(revCredits.rows[0].c).toBe(1);
    } else {
      expect(revCredits.rows[0].c).toBe(0);
    }
  });
});
