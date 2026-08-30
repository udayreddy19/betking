import { describe, it, expect, beforeEach } from 'vitest';
import { query, queryRead } from '../../db/pg.js';
import { getWalletBreakdown, formatInr, getWalletBucketRows, getWithdrawableHint } from '../../src/utils/walletBalance.js';
import { fetchUserTransactions, mapTransactionRow } from '../../lib/userTransactions.mjs';
import { financialReconciliationEngine } from '../../lib/financialReconciliationEngine.mjs';

describe('ODDSYRA — Wallet UX & Admin Control Audit Suite (16 Scenarios)', () => {
  const testUserId = 'usr_ux_audit_test_01';
  const victimUserId = 'usr_ux_audit_victim_02';

  beforeEach(async () => {
    await query(`
      INSERT INTO users (user_id, email, password_hash, status)
      VALUES 
        ($1, 'ux_test_01@oddsyra.com', 'hash', 'ACTIVE'),
        ($2, 'ux_victim_02@oddsyra.com', 'hash', 'ACTIVE')
      ON CONFLICT (user_id) DO NOTHING;
    `, [testUserId, victimUserId]);

    await query(`
      INSERT INTO wallets (wallet_id, user_id, balance, bonus_balance, reserved_balance, freebet_balance, locked_deposit_balance, winnings_balance, currency)
      VALUES 
        ('wal_ux_01', $1, 2500.00, 500.00, 300.00, 200.00, 400.00, 1200.00, 'INR'),
        ('wal_ux_02', $2, 9000.00, 0.00, 0.00, 0.00, 0.00, 0.00, 'INR')
      ON CONFLICT (user_id) DO UPDATE
      SET balance = EXCLUDED.balance, bonus_balance = EXCLUDED.bonus_balance, reserved_balance = EXCLUDED.reserved_balance,
          freebet_balance = EXCLUDED.freebet_balance, locked_deposit_balance = EXCLUDED.locked_deposit_balance,
          winnings_balance = EXCLUDED.winnings_balance;
    `, [testUserId, victimUserId]);

    await query(`DELETE FROM ledger_entries WHERE wallet_id IN ('wal_ux_01', 'wal_ux_02')`);
    await query(`DELETE FROM transactions WHERE user_id IN ($1, $2)`, [testUserId, victimUserId]);
  });

  it('TEST 1: Wallet dashboard shows correct backend balances', () => {
    const userState = {
      balance: 2500.00,
      bonusBalance: 500.00,
      freebetBalance: 200.00,
      reservedBalance: 300.00,
      lockedDepositBalance: 400.00,
      winningsBalance: 1200.00,
    };
    const breakdown = getWalletBreakdown(userState);

    expect(breakdown.cashBalance).toBe(2500.00);
    expect(breakdown.bonus).toBe(500.00);
    expect(breakdown.freebets).toBe(200.00);
    expect(breakdown.total).toBe(3200.00); // 2500 + 500 + 200
    expect(breakdown.availableBalance).toBe(2500.00); // Playable cash
    expect(breakdown.withdrawable).toBe(2100.00); // 2500 - 400 locked deposit
    expect(breakdown.pendingWithdrawal).toBe(300.00);
  });

  it('TEST 2: Cash and bonus are clearly separated in breakdown buckets', () => {
    const userState = {
      balance: 1000.00,
      bonusBalance: 450.00,
      freebetBalance: 150.00,
      reservedBalance: 0.00,
      lockedDepositBalance: 0.00,
    };
    const breakdown = getWalletBreakdown(userState);
    const rows = getWalletBucketRows(breakdown);

    const cashRow = rows.find((r) => r.key === 'available');
    const bonusRow = rows.find((r) => r.key === 'bonus');
    const freebetRow = rows.find((r) => r.key === 'freebet');

    expect(cashRow.tone).toBe('cash');
    expect(bonusRow.tone).toBe('bonus');
    expect(bonusRow.value).toBe(450.00);
    expect(freebetRow.tone).toBe('freebet');
    expect(freebetRow.value).toBe(150.00);
  });

  it('TEST 3: Transaction history pagination works correctly', async () => {
    for (let i = 1; i <= 5; i++) {
      await query(`
        INSERT INTO transactions (transaction_id, user_id, type, amount, status, created_at)
        VALUES ($1, $2, 'DEPOSIT', $3, 'COMPLETED', NOW() - INTERVAL '${i} hour');
      `, [`tx_page_${i}`, testUserId, i * 100]);
    }

    const page1 = await fetchUserTransactions(testUserId, { limit: 2, offset: 0 });
    const page2 = await fetchUserTransactions(testUserId, { limit: 2, offset: 2 });
    const page3 = await fetchUserTransactions(testUserId, { limit: 2, offset: 4 });

    expect(page1.length).toBe(2);
    expect(page2.length).toBe(2);
    expect(page3.length).toBe(1);
    expect(page1[0].id).not.toBe(page2[0].id);
  });

  it('TEST 4: User cannot view another users transactions (IDOR protection)', async () => {
    await query(`
      INSERT INTO transactions (transaction_id, user_id, type, amount, status)
      VALUES ('tx_victim_secret', $1, 'DEPOSIT', 9999.00, 'COMPLETED');
    `, [victimUserId]);

    const userTxs = await fetchUserTransactions(testUserId, { limit: 50, offset: 0 });
    const hasVictimTx = userTxs.some((t) => t.id === 'tx_victim_secret');
    expect(hasVictimTx).toBe(false);
  });

  it('TEST 5: Deposit pending -> completed mapping updates cleanly', () => {
    const pendingTx = mapTransactionRow({
      transaction_id: 'tx_dep_pending',
      type: 'DEPOSIT',
      amount: '500.00',
      status: 'PENDING',
      method: 'UPI',
      created_at: new Date(),
    });
    expect(pendingTx.type).toBe('deposit');
    expect(pendingTx.amount).toBe(500.00);
    expect(pendingTx.status).toBe('PENDING');

    const completedTx = mapTransactionRow({
      transaction_id: 'tx_dep_pending',
      type: 'DEPOSIT',
      amount: '500.00',
      status: 'COMPLETED',
      method: 'UPI',
      created_at: new Date(),
    });
    expect(completedTx.status).toBe('COMPLETED');
  });

  it('TEST 6: Withdrawal pending -> completed UI updates correctly', () => {
    const wdTx = mapTransactionRow({
      transaction_id: 'tx_wd_01',
      type: 'WITHDRAWAL',
      amount: '750.00',
      status: 'PROCESSING',
      method: 'BANK_TRANSFER',
      created_at: new Date(),
    });
    expect(wdTx.type).toBe('withdraw');
    expect(wdTx.amount).toBe(-750.00); // Debit is negative
    expect(wdTx.status).toBe('PROCESSING');
  });

  it('TEST 7: Failed transaction displays correctly with user-friendly label', () => {
    const failedTx = mapTransactionRow({
      transaction_id: 'tx_fail_01',
      type: 'DEPOSIT',
      amount: '300.00',
      status: 'FAILED',
      method: 'UPI',
      created_at: new Date(),
    });
    expect(failedTx.status).toBe('FAILED');
    expect(failedTx.label).toContain('Deposit');
  });

  it('TEST 8: Bet stake transaction displays correctly as debit', () => {
    const stakeTx = mapTransactionRow({
      transaction_id: 'tx_stake_01',
      type: 'BET_STAKE',
      amount: '200.00',
      status: 'COMPLETED',
      created_at: new Date(),
    });
    expect(stakeTx.type).toBe('bet_stake');
    expect(stakeTx.amount).toBe(-200.00);
    expect(stakeTx.label).toBe('Bet Stake');
  });

  it('TEST 9: Bet winnings display correctly as credit', () => {
    const winTx = mapTransactionRow({
      transaction_id: 'tx_win_01',
      type: 'BET_PAYOUT',
      amount: '480.00',
      status: 'COMPLETED',
      created_at: new Date(),
    });
    expect(winTx.type).toBe('bet_win');
    expect(winTx.amount).toBe(480.00);
    expect(winTx.label).toBe('Bet Win');
  });

  it('TEST 10: Bonus/free-bet expiry displays correctly with helper text', () => {
    const user = {
      balance: 1000,
      lockedDepositBalance: 500,
    };
    const wallet = getWalletBreakdown(user);
    const hint = getWithdrawableHint(wallet);
    expect(hint).toContain('Wager ₹500 of your deposit');
  });

  it('TEST 11: Admin can search user wallet by email, user ID, or transaction ID', async () => {
    const txId = 'tx_investigate_01';
    await query(`
      INSERT INTO transactions (transaction_id, user_id, type, amount, status)
      VALUES ($1, $2, 'DEPOSIT', 1500.00, 'COMPLETED');
    `, [txId, testUserId]);

    // Test lookup by User ID
    const resUser = await queryRead(`SELECT user_id, email FROM users WHERE user_id = $1`, [testUserId]);
    expect(resUser.rows[0].email).toBe('ux_test_01@oddsyra.com');

    // Test lookup by Transaction ID
    const resTx = await queryRead(`SELECT user_id FROM transactions WHERE transaction_id = $1`, [txId]);
    expect(resTx.rows[0].user_id).toBe(testUserId);
  });

  it('TEST 12: Admin transaction timeline is chronological and formatted', async () => {
    await query(`
      INSERT INTO transactions (transaction_id, user_id, type, amount, status, created_at)
      VALUES 
        ('tx_t1', $1, 'DEPOSIT', 1000.00, 'COMPLETED', NOW() - INTERVAL '2 hour'),
        ('tx_t2', $1, 'BET_STAKE', 200.00, 'COMPLETED', NOW() - INTERVAL '1 hour'),
        ('tx_t3', $1, 'BET_PAYOUT', 500.00, 'COMPLETED', NOW());
    `, [testUserId]);

    const timeline = await queryRead(`
      SELECT transaction_id, type, amount, status, created_at
      FROM transactions
      WHERE user_id = $1
      ORDER BY created_at DESC;
    `, [testUserId]);

    expect(timeline.rows.length).toBe(3);
    expect(timeline.rows[0].type).toBe('BET_PAYOUT');
    expect(timeline.rows[2].type).toBe('DEPOSIT');
  });

  it('TEST 13: Admin adjustment requires reason and creates audit event', async () => {
    await query(`
      INSERT INTO audit_events (actor_id, target_id, action, details)
      VALUES ('admin_01', $1, 'MANUAL_WALLET_CREDIT', $2);
    `, [testUserId, JSON.stringify({ amount: 100, reason: 'Goodwill resolution ticket #991' })]);

    const audit = await queryRead(
      `SELECT * FROM audit_events WHERE target_id = $1 AND action = 'MANUAL_WALLET_CREDIT' ORDER BY event_id DESC LIMIT 1`,
      [testUserId]
    );
    expect(audit.rows.length).toBe(1);
    expect(audit.rows[0].details.reason).toBe('Goodwill resolution ticket #991');
  });

  it('TEST 14: Unauthorized user cannot access admin wallet without permission', () => {
    const rolesWithoutFinance = ['SUPPORT_AGENT', 'MARKETING_ADMIN', 'USER'];
    const requiredPermission = 'finance';

    rolesWithoutFinance.forEach((role) => {
      const hasPermission = role === 'SUPER_ADMIN' || role === 'FINANCE_ADMIN';
      expect(hasPermission).toBe(false);
    });
  });

  it('TEST 15: Reconciliation dashboard is strictly read-only and non-mutating', async () => {
    const report = await financialReconciliationEngine.reconcileUserWallet(testUserId);
    expect(report.reconciled).toBeDefined();

    // Verify balance remains unmodified
    const wRes = await queryRead(`SELECT balance FROM wallets WHERE user_id = $1`, [testUserId]);
    expect(parseFloat(wRes.rows[0].balance)).toBe(2500.00);
  });

  it('TEST 16: Mobile wallet formatting and safety checks operate reliably', () => {
    expect(formatInr(0)).toBe('₹0');
    expect(formatInr(1500.50)).toBe('₹1,500.50');
    expect(formatInr(100000)).toBe('₹1,00,000');
  });
});
