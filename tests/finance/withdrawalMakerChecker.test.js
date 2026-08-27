/**
 * Maker ≠ checker dual-control for HIGH/CRITICAL withdrawals.
 */
import { describe, it, expect, beforeEach } from 'vitest';

const hasDb = Boolean(process.env.DATABASE_URL || process.env.PG_CONNECTION_STRING);

describe.runIf(hasDb)('Withdrawal maker-checker dual control', () => {
  let query;
  let withdrawalEngine;

  const userId = 'usr_mc_dual';
  const walletId = 'wal_mc_dual';

  beforeEach(async () => {
    ({ query } = await import('../../db/pg.js'));
    ({ withdrawalEngine } = await import('../../lib/withdrawalEngine.mjs'));

    await query(`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS reserved_balance NUMERIC(14,2) NOT NULL DEFAULT 0`);
    await query(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS risk_score NUMERIC(6,2)`);
    await query(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS risk_level VARCHAR(16)`);
    await query(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS risk_signals JSONB DEFAULT '[]'::jsonb`);
    await query(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS risk_evaluated_at TIMESTAMPTZ`);
    await query(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS risk_decision VARCHAR(16)`);
    await query(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS risk_reviewed_by VARCHAR(64)`);
    await query(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS risk_review_notes TEXT`);
    await query(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS maker_admin_id VARCHAR(64)`);
    await query(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS maker_reviewed_at TIMESTAMPTZ`);
    await query(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS checker_admin_id VARCHAR(64)`);
    await query(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS checker_approved_at TIMESTAMPTZ`);
    await query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`);

    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1,$2,'h') ON CONFLICT DO NOTHING`, [
      userId, `${userId}@test.com`,
    ]);
    await query(`
      INSERT INTO user_profiles (user_id, account_status, kyc_status, date_of_birth)
      VALUES ($1, 'ACTIVE', 'VERIFIED', '1990-01-01')
      ON CONFLICT (user_id) DO UPDATE SET kyc_status = 'VERIFIED', account_status = 'ACTIVE', date_of_birth = '1990-01-01'
    `, [userId]);
    await query(`DELETE FROM kyc_cases WHERE user_id = $1`, [userId]);
    await query(`
      INSERT INTO kyc_cases (case_id, user_id, status, pan_number, aadhaar_number, updated_at)
      VALUES ($1, $2, 'VERIFIED', 'MCCHK1234A', '900022223333', NOW())
      ON CONFLICT (case_id) DO UPDATE SET status = 'VERIFIED'
    `, [`kyc_${userId}`, userId]);

    await query(`DELETE FROM ledger_entries WHERE wallet_id = $1`, [walletId]);
    await query(`DELETE FROM transactions WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM withdrawals WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM wallets WHERE user_id = $1`, [userId]);
    await query(
      `INSERT INTO wallets (wallet_id, user_id, balance, reserved_balance, currency)
       VALUES ($1, $2, 50000, 0, 'INR')`,
      [walletId, userId],
    );
  });

  async function seedHighRiskWithdrawal(amount = 2000) {
    const wdId = `wd_mc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await query(
      `INSERT INTO withdrawals (
         withdrawal_id, user_id, amount, currency, status, bank_details, created_at,
         risk_score, risk_level, risk_signals, risk_evaluated_at
       ) VALUES ($1, $2, $3, 'INR', 'PENDING_REVIEW', $4::jsonb, NOW(), 60, 'HIGH', '[]'::jsonb, NOW())`,
      [wdId, userId, amount, JSON.stringify({ method: 'UPI', account: '9999' })],
    );
    await query(
      `UPDATE wallets SET balance = balance - $1, reserved_balance = reserved_balance + $1 WHERE wallet_id = $2`,
      [amount, walletId],
    );
    await query(
      `INSERT INTO transactions (transaction_id, user_id, type, amount, status, created_at)
       VALUES ($1, $2, 'WITHDRAWAL', $3, 'PENDING', NOW())
       ON CONFLICT DO NOTHING`,
      [`tx_${wdId}`, userId, amount],
    );
    return wdId;
  }

  it('maker can review but cannot self-approve as checker', async () => {
    const wdId = await seedHighRiskWithdrawal();
    const maker = await withdrawalEngine.reviewWithdrawal({
      withdrawalId: wdId,
      adminId: 'admin_maker',
      decision: 'APPROVE',
      reason: 'Looks ok',
    });
    expect(maker.status).toBe('PENDING_CHECKER');
    expect(maker.makerAdminId).toBe('admin_maker');

    await expect(
      withdrawalEngine.reviewWithdrawal({
        withdrawalId: wdId,
        adminId: 'admin_maker',
        decision: 'APPROVE',
        reason: 'Self approve',
      }),
    ).rejects.toMatchObject({ code: 'MAKER_CHECKER_SAME_ADMIN' });

    const st = await query(`SELECT status FROM withdrawals WHERE withdrawal_id = $1`, [wdId]);
    expect(String(st.rows[0].status).toUpperCase()).toBe('PENDING_CHECKER');
  });

  it('checker (different admin) can approve after maker', async () => {
    const wdId = await seedHighRiskWithdrawal();
    await withdrawalEngine.reviewWithdrawal({
      withdrawalId: wdId,
      adminId: 'admin_maker',
      decision: 'APPROVE',
    });
    const approved = await withdrawalEngine.reviewWithdrawal({
      withdrawalId: wdId,
      adminId: 'admin_checker',
      decision: 'APPROVE',
      reason: 'Checker ok',
    });
    expect(approved.status).toBe('APPROVED');
    expect(approved.checkerAdminId).toBe('admin_checker');
    expect(approved.makerAdminId).toBe('admin_maker');

    const w = await query(`SELECT reserved_balance FROM wallets WHERE wallet_id = $1`, [walletId]);
    expect(parseFloat(w.rows[0].reserved_balance)).toBe(0);

    // Idempotent re-approve
    const again = await withdrawalEngine.reviewWithdrawal({
      withdrawalId: wdId,
      adminId: 'admin_other',
      decision: 'APPROVE',
    });
    expect(again.idempotent).toBe(true);
    expect(again.status).toBe('APPROVED');
  });

  it('CRITICAL checker requires force + reason', async () => {
    const wdId = await seedHighRiskWithdrawal(2500);
    await query(`UPDATE withdrawals SET risk_level = 'CRITICAL', risk_score = 90 WHERE withdrawal_id = $1`, [wdId]);

    await withdrawalEngine.reviewWithdrawal({
      withdrawalId: wdId,
      adminId: 'admin_maker',
      decision: 'APPROVE',
    });

    await expect(
      withdrawalEngine.reviewWithdrawal({
        withdrawalId: wdId,
        adminId: 'admin_checker',
        decision: 'APPROVE',
      }),
    ).rejects.toMatchObject({ code: 'RISK_BLOCK_AUTO_APPROVE' });

    const ok = await withdrawalEngine.reviewWithdrawal({
      withdrawalId: wdId,
      adminId: 'admin_checker',
      decision: 'APPROVE',
      forceApprove: true,
      reason: 'Manual override after enhanced review',
    });
    expect(ok.status).toBe('APPROVED');
  });

  it('rejected withdrawal stays rejected and restores reserved funds', async () => {
    const wdId = await seedHighRiskWithdrawal(1500);
    const before = await query(`SELECT balance, reserved_balance FROM wallets WHERE wallet_id = $1`, [walletId]);
    await withdrawalEngine.reviewWithdrawal({
      withdrawalId: wdId,
      adminId: 'admin_maker',
      decision: 'REJECT',
      reason: 'Suspicious',
    });
    const after = await query(`SELECT status FROM withdrawals WHERE withdrawal_id = $1`, [wdId]);
    expect(String(after.rows[0].status).toUpperCase()).toBe('REJECTED');
    const w = await query(`SELECT balance, reserved_balance FROM wallets WHERE wallet_id = $1`, [walletId]);
    expect(parseFloat(w.rows[0].reserved_balance)).toBe(0);
    expect(parseFloat(w.rows[0].balance)).toBe(parseFloat(before.rows[0].balance) + 1500);
  });
});

describe.runIf(!hasDb)('Withdrawal maker-checker (skipped)', () => {
  it('skips without DATABASE_URL', () => {
    expect(hasDb).toBe(false);
  });
});
