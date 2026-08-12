import { describe, it, expect, beforeEach } from 'vitest';
import { financialReconciliationEngine } from '../../lib/financialReconciliationEngine.mjs';
import { query } from '../../db/pg.js';

describe('Phase 6 Financial Reconciliation & Checksum Security Tests', () => {
  const userId = 'usr_rec_101';
  const walletId = 'w_rec_101';

  beforeEach(async () => {
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT (user_id) DO NOTHING;`, [userId, `${userId}@example.com`]);
    await query(`DELETE FROM financial_discrepancies WHERE user_id = $1;`, [userId]);
    await query(`DELETE FROM ledger_entries WHERE wallet_id IN (SELECT wallet_id FROM wallets WHERE user_id = $1);`, [userId]);
    await query(`DELETE FROM transactions WHERE user_id = $1;`, [userId]);
    await query(`DELETE FROM wallets WHERE user_id = $1;`, [userId]);
    await query(`INSERT INTO wallets (wallet_id, user_id, balance, currency) VALUES ($1, $2, 1000.00, 'INR');`, [walletId, userId]);
  });

  it('should report zero discrepancy when wallet balance equals ledger checksum', async () => {
    const tx1 = `tx_r1_${Date.now()}`;
    const tx2 = `tx_r2_${Date.now()}`;
    // Add ledger entries matching ₹1000 balance (Deposit ₹1500, Stake ₹500)
    await query(`INSERT INTO transactions (transaction_id, user_id, type, amount, status) VALUES ($1, $2, 'DEPOSIT', 1500.00, 'SUCCESS');`, [tx1, userId]);
    await query(`INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description) VALUES ($1, $2, 'CREDIT', 1500.00, 1500.00, 'Deposit');`, [walletId, tx1]);

    await query(`INSERT INTO transactions (transaction_id, user_id, type, amount, status) VALUES ($1, $2, 'BET_STAKE', 500.00, 'SUCCESS');`, [tx2, userId]);
    await query(`INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description) VALUES ($1, $2, 'DEBIT', 500.00, 1000.00, 'Stake');`, [walletId, tx2]);

    const report = await financialReconciliationEngine.reconcileUserWallet(userId);
    expect(report.reconciled).toBe(true);
    expect(report.difference).toBe(0.00);
  });

  it('CRITICAL: must detect balance mismatch and flag discrepancy WITHOUT modifying DB balance', async () => {
    const tx3 = `tx_r3_${Date.now()}`;
    // Ledger sum is ₹500 (Deposit ₹500), but DB balance is artificially set to ₹1000
    await query(`INSERT INTO transactions (transaction_id, user_id, type, amount, status) VALUES ($1, $2, 'DEPOSIT', 500.00, 'SUCCESS');`, [tx3, userId]);
    await query(`INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description) VALUES ($1, $2, 'CREDIT', 500.00, 500.00, 'Deposit');`, [walletId, tx3]);

    const report = await financialReconciliationEngine.reconcileUserWallet(userId);
    expect(report.reconciled).toBe(false);
    expect(report.storedBalance).toBe(1000.00);
    expect(report.ledgerSum).toBe(500.00);
    expect(report.difference).toBe(500.00);
    expect(report.discrepancyId).toBeDefined();

    // Verify DB balance was NOT modified automatically
    const wRes = await query('SELECT balance FROM wallets WHERE wallet_id = $1', [walletId]);
    expect(parseFloat(wRes.rows[0].balance)).toBe(1000.00);

    // Verify discrepancy record was logged
    const dRes = await query('SELECT * FROM financial_discrepancies WHERE discrepancy_id = $1', [report.discrepancyId]);
    expect(dRes.rows.length).toBe(1);
    expect(dRes.rows[0].type).toBe('BALANCE_MISMATCH');
  });
});
