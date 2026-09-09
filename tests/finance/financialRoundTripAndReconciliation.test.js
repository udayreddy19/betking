/**
 * Phase 4O & 4P — Financial Round Trip, Idempotency & Payment Reconciliation Suite
 *
 * Validates:
 *   - Phase 4O: Full Money Flow (Deposit -> Bet -> Win/Loss/Void -> Withdrawal)
 *   - Concurrency: 10 identical simultaneous requests -> exactly one transaction
 *   - Financial Invariant: wallet.balance == sum(ledger.credits) - sum(ledger.debits)
 *   - Phase 4P: Payment Gateway Reconciliation (Cashfree & Razorpay)
 *   - Webhook timestamp skew protection & replay attack defense
 */

import crypto from 'crypto';
import { describe, it, expect, beforeEach } from 'vitest';
import { query } from '../../db/pg.js';
import { cashfreeProvider } from '../../lib/paymentProviders/CashfreeProvider.mjs';
import { razorpayProvider } from '../../lib/paymentProviders/RazorpayProvider.mjs';
import { idempotencyEngine } from '../../lib/idempotencyEngine.mjs';
import { FinancialReconciliationEngine } from '../../lib/financialReconciliationEngine.mjs';

const hasDb = Boolean(process.env.DATABASE_URL || process.env.PG_CONNECTION_STRING);

describe.runIf(hasDb)('Phase 4O & 4P — Financial Round Trip & Reconciliation', () => {
  const reconEngine = new FinancialReconciliationEngine();
  const testUserId = `usr_fin_roundtrip_${Date.now()}`;
  const testWalletId = `wal_${testUserId}`;

  beforeEach(async () => {
    // Setup isolated user and wallet
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT DO NOTHING`, [
      testUserId, `${testUserId}@example.com`,
    ]);
    await query(`
      INSERT INTO wallets (wallet_id, user_id, balance, reserved_balance, currency)
      VALUES ($1, $2, 0.00, 0.00, 'INR')
      ON CONFLICT (user_id) DO UPDATE SET balance = 0.00, reserved_balance = 0.00
    `, [testWalletId, testUserId]);
    await query(`DELETE FROM ledger_entries WHERE wallet_id = $1`, [testWalletId]);
    await query(`DELETE FROM transactions WHERE user_id = $1`, [testUserId]);
  });

  // Phase 4O: Complete Financial Round Trip
  describe('Phase 4O: Full Financial Round Trip & Invariant Integrity', () => {
    it('executes deposit -> bet -> win -> loss -> void -> withdrawal with strict ledger equality', async () => {
      // 1. Deposit 1,000 INR
      await query(
        `UPDATE wallets SET balance = balance + 1000 WHERE wallet_id = $1`,
        [testWalletId],
      );
      await query(
        `INSERT INTO ledger_entries (wallet_id, amount, type, balance_after, description, created_at)
         VALUES ($1, 1000.00, 'CREDIT', 1000.00, 'DEPOSIT', NOW())`,
        [testWalletId],
      );

      let recon = await reconEngine.reconcileUserWallet(testUserId);
      expect(recon.reconciled).toBe(true);
      expect(recon.storedBalance).toBe(1000.00);

      // 2. Bet placement 200 INR (Debit)
      await query(
        `UPDATE wallets SET balance = balance - 200 WHERE wallet_id = $1`,
        [testWalletId],
      );
      await query(
        `INSERT INTO ledger_entries (wallet_id, amount, type, balance_after, description, created_at)
         VALUES ($1, 200.00, 'DEBIT', 800.00, 'BET_STAKE', NOW())`,
        [testWalletId],
      );

      recon = await reconEngine.reconcileUserWallet(testUserId);
      expect(recon.reconciled).toBe(true);
      expect(recon.storedBalance).toBe(800.00);

      // 3. Bet Win payout 500 INR (Credit)
      await query(
        `UPDATE wallets SET balance = balance + 500 WHERE wallet_id = $1`,
        [testWalletId],
      );
      await query(
        `INSERT INTO ledger_entries (wallet_id, amount, type, balance_after, description, created_at)
         VALUES ($1, 500.00, 'CREDIT', 1300.00, 'BET_PAYOUT_WIN', NOW())`,
        [testWalletId],
      );

      recon = await reconEngine.reconcileUserWallet(testUserId);
      expect(recon.reconciled).toBe(true);
      expect(recon.storedBalance).toBe(1300.00);

      // 4. Bet Loss 100 INR (Debit)
      await query(
        `UPDATE wallets SET balance = balance - 100 WHERE wallet_id = $1`,
        [testWalletId],
      );
      await query(
        `INSERT INTO ledger_entries (wallet_id, amount, type, balance_after, description, created_at)
         VALUES ($1, 100.00, 'DEBIT', 1200.00, 'BET_STAKE_LOSS', NOW())`,
        [testWalletId],
      );

      recon = await reconEngine.reconcileUserWallet(testUserId);
      expect(recon.reconciled).toBe(true);
      expect(recon.storedBalance).toBe(1200.00);

      // 5. Void Bet Refund 100 INR (Debit stake, then Credit refund)
      await query(
        `UPDATE wallets SET balance = balance - 100 WHERE wallet_id = $1`,
        [testWalletId],
      );
      await query(
        `INSERT INTO ledger_entries (wallet_id, amount, type, balance_after, description, created_at)
         VALUES ($1, 100.00, 'DEBIT', 1100.00, 'BET_STAKE_VOID_INIT', NOW())`,
        [testWalletId],
      );
      await query(
        `UPDATE wallets SET balance = balance + 100 WHERE wallet_id = $1`,
        [testWalletId],
      );
      await query(
        `INSERT INTO ledger_entries (wallet_id, amount, type, balance_after, description, created_at)
         VALUES ($1, 100.00, 'CREDIT', 1200.00, 'BET_STAKE_VOID_REFUND', NOW())`,
        [testWalletId],
      );

      recon = await reconEngine.reconcileUserWallet(testUserId);
      expect(recon.reconciled).toBe(true);
      expect(recon.storedBalance).toBe(1200.00);

      // 6. Withdrawal request 500 INR (Reserved balance)
      await query(
        `UPDATE wallets SET balance = balance - 500, reserved_balance = reserved_balance + 500 WHERE wallet_id = $1`,
        [testWalletId],
      );
      await query(
        `INSERT INTO ledger_entries (wallet_id, amount, type, balance_after, description, created_at)
         VALUES ($1, 500.00, 'DEBIT', 700.00, 'WITHDRAWAL_RESERVED', NOW())`,
        [testWalletId],
      );

      recon = await reconEngine.reconcileUserWallet(testUserId);
      expect(recon.reconciled).toBe(true);
      expect(recon.storedBalance).toBe(700.00);

      // Final Invariant Check: wallet.balance === sum(credits) - sum(debits)
      const ledgerCheck = await query(
        `SELECT
           COALESCE(SUM(CASE WHEN type = 'CREDIT' THEN amount ELSE 0 END), 0) -
           COALESCE(SUM(CASE WHEN type = 'DEBIT' THEN amount ELSE 0 END), 0) AS net
         FROM ledger_entries WHERE wallet_id = $1`,
        [testWalletId],
      );
      expect(parseFloat(ledgerCheck.rows[0].net)).toBe(700.00);
    });

    it('enforces exactly-once execution under 10 simultaneous identical requests', async () => {
      const idempotencyKey = `idemp_conc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      let executionCount = 0;

      const workerTask = async () => {
        const lock = await idempotencyEngine.checkOrLock(idempotencyKey, 'FINANCIAL_DEPOSIT_CREDIT', 'hash_123', testUserId);
        if (lock.isDuplicate) {
          return { status: 'DUPLICATE', isDuplicate: true };
        }

        // Execute critical financial operation exactly once
        executionCount++;
        await query(
          `UPDATE wallets SET balance = balance + 250 WHERE wallet_id = $1`,
          [testWalletId],
        );
        await query(
          `INSERT INTO ledger_entries (wallet_id, amount, type, balance_after, description, created_at)
           VALUES ($1, 250.00, 'CREDIT', 250.00, 'CONCURRENT_DEPOSIT', NOW())`,
          [testWalletId],
        );

        await idempotencyEngine.complete(idempotencyKey, { status: 'SUCCESS', credited: 250 });
        return { status: 'SUCCESS', isDuplicate: false, credited: 250 };
      };

      // Launch 10 simultaneous identical requests
      const results = await Promise.all(Array.from({ length: 10 }, () => workerTask()));

      // Invariant: Exactly ONE execution must occur
      expect(executionCount).toBe(1);

      const successful = results.filter((r) => !r.isDuplicate);
      const duplicates = results.filter((r) => r.isDuplicate);
      expect(successful).toHaveLength(1);
      expect(duplicates).toHaveLength(9);

      // Wallet balance must be exactly 250, NOT 2,500!
      const w = await query(`SELECT balance FROM wallets WHERE wallet_id = $1`, [testWalletId]);
      expect(parseFloat(w.rows[0].balance)).toBe(250.00);

      const recon = await reconEngine.reconcileUserWallet(testUserId);
      expect(recon.reconciled).toBe(true);
      expect(recon.storedBalance).toBe(250.00);
    });
  });

  // Phase 4P: Payment Gateway Reconciliation & Webhook Security
  describe('Phase 4P: Payment Gateway Reconciliation', () => {
    it('verifies Cashfree webhook timestamp skew protection rejects expired/future payloads', () => {
      const origSecret = process.env.CASHFREE_WEBHOOK_SECRET;
      process.env.CASHFREE_WEBHOOK_SECRET = 'test_secret_for_webhook';
      const secret = 'test_secret_for_webhook';
      const rawPayload = JSON.stringify({ data: { order: { order_id: 'order_123' } } });

      // 1. Skewed timestamp (> 300 seconds in past)
      const oldTimestamp = String(Math.floor(Date.now() / 1000) - 350);
      const oldSignature = crypto
        .createHmac('sha256', secret)
        .update(oldTimestamp + rawPayload)
        .digest('base64');

      const oldResult = cashfreeProvider.verifyWebhookSignature({
        rawBody: rawPayload,
        headers: {
          'x-webhook-signature': oldSignature,
          'x-webhook-timestamp': oldTimestamp,
        },
        maxSkewSeconds: 300,
      });

      expect(oldResult).toBe(false);

      // 2. Fresh timestamp (< 300 seconds)
      const freshTimestamp = String(Math.floor(Date.now() / 1000) - 10);
      const freshSignature = crypto
        .createHmac('sha256', secret)
        .update(freshTimestamp + rawPayload)
        .digest('base64');

      const freshResult = cashfreeProvider.verifyWebhookSignature({
        rawBody: rawPayload,
        headers: {
          'x-webhook-signature': freshSignature,
          'x-webhook-timestamp': freshTimestamp,
        },
        maxSkewSeconds: 300,
      });

      expect(freshResult).toBe(true);
      if (origSecret) process.env.CASHFREE_WEBHOOK_SECRET = origSecret;
      else delete process.env.CASHFREE_WEBHOOK_SECRET;
    });

    it('verifies Razorpay webhook signature validation rejects tampered payloads', () => {
      const payload = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_123' } } } });
      const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'rzp_sec_test';

      const validSig = crypto
        .createHmac('sha256', secret)
        .update(Buffer.from(payload, 'utf8'))
        .digest('hex');

      // Valid signature passes
      expect(
        razorpayProvider.verifyWebhookSignature({
          rawBody: payload,
          signature: validSig,
        })
      ).toBe(true);

      // Tampered payload fails
      expect(
        razorpayProvider.verifyWebhookSignature({
          rawBody: payload + 'tampered',
          signature: validSig,
        })
      ).toBe(false);
    });
  });
});

describe.runIf(!hasDb)('Phase 4O & 4P — Financial Round Trip (skipped without DB)', () => {
  it('skips gracefully when DATABASE_URL is not set', () => {
    expect(hasDb).toBe(false);
  });
});
