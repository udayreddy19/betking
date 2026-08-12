/**
 * Withdrawal Engine & Fund Reservation Pipeline
 * Handles withdrawal requests, KYC validation, fund holds (reserved_balance), admin review, and reversals.
 */

import { query, withTransaction } from '../db/pg.js';
import { accountEligibilityEngine } from './accountEligibilityEngine.mjs';

export class WithdrawalEngine {
  constructor(options = {}) {
    this.minWithdrawal = options.minWithdrawal || 100.00; // Min ₹100.00
    this.maxWithdrawal = options.maxWithdrawal || 100000.00; // Max ₹100,000.00
  }

  /** Submit Withdrawal Request & Hold Funds */
  async requestWithdrawal({ userId, amount, bankDetails = {} }, correlationId = null) {
    if (!userId) {
      throw new Error('USER_UNAUTHENTICATED: User ID is required');
    }

    await accountEligibilityEngine.verifyEligibility(userId);

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      throw new Error('INVALID_AMOUNT: Withdrawal amount must be a positive number');
    }

    const strAmount = String(numericAmount);
    if (strAmount.includes('.') && strAmount.split('.')[1].length > 2) {
      throw new Error('INVALID_AMOUNT: Withdrawal amount cannot exceed 2 decimal places');
    }

    if (numericAmount < this.minWithdrawal) {
      throw new Error(`WITHDRAWAL_LIMIT_EXCEEDED: Minimum withdrawal amount is ₹${this.minWithdrawal.toFixed(2)}`);
    }
    if (numericAmount > this.maxWithdrawal) {
      throw new Error(`WITHDRAWAL_LIMIT_EXCEEDED: Maximum withdrawal amount is ₹${this.maxWithdrawal.toFixed(2)}`);
    }

    // Check KYC Status
    try {
      const kycRes = await query('SELECT kyc_status FROM user_kyc_controls WHERE user_id = $1', [userId]);
      if (kycRes.rows.length > 0) {
        const kycStatus = String(kycRes.rows[0].kyc_status).toUpperCase();
        if (kycStatus === 'REJECTED' || kycStatus === 'SUSPENDED') {
          throw new Error(`KYC_RESTRICTED: User KYC status is ${kycStatus}`);
        }
      }
    } catch (err) {
      if (err.message.includes('KYC_')) throw err;
    }

    const withdrawalId = `wdr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    // Execute Fund Hold inside PostgreSQL Transaction
    const result = await withTransaction(async (client) => {
      const walletRes = await client.query(
        `SELECT wallet_id, balance, COALESCE(reserved_balance, 0.00) as reserved_balance FROM wallets WHERE user_id = $1 FOR UPDATE`,
        [userId]
      );

      if (walletRes.rows.length === 0) {
        throw new Error(`Wallet not found for user ${userId}`);
      }

      const wallet = walletRes.rows[0];
      const currentBalance = parseFloat(wallet.balance);
      const reservedBalance = parseFloat(wallet.reserved_balance);
      const availableBalance = parseFloat((currentBalance - reservedBalance).toFixed(2));

      if (availableBalance < numericAmount) {
        throw new Error(`INSUFFICIENT_FUNDS: Available balance ₹${availableBalance} is less than requested withdrawal ₹${numericAmount}`);
      }

      const newReserved = parseFloat((reservedBalance + numericAmount).toFixed(2));
      await client.query(
        `UPDATE wallets SET reserved_balance = $1, updated_at = NOW() WHERE wallet_id = $2`,
        [newReserved, wallet.wallet_id]
      );

      // Insert Withdrawal Record
      await client.query(
        `INSERT INTO withdrawals (withdrawal_id, user_id, amount, currency, status, bank_details, created_at)
         VALUES ($1, $2, $3, 'INR', 'PENDING_REVIEW', $4, NOW())`,
        [withdrawalId, userId, numericAmount, JSON.stringify(bankDetails)]
      );

      // Record Transaction Record
      const txId = `tx_${withdrawalId}`;
      await client.query(
        `INSERT INTO transactions (transaction_id, user_id, type, amount, status, created_at)
         VALUES ($1, $2, 'WITHDRAWAL', $3, 'PENDING', NOW())`,
        [txId, userId, numericAmount]
      );

      // Record Ledger Entry
      await client.query(
        `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description, created_at)
         VALUES ($1, $2, 'DEBIT', $3, $4, 'Withdrawal Funds Hold', NOW())`,
        [wallet.wallet_id, txId, numericAmount, currentBalance]
      );

      // Record Outbox Event
      await client.query(
        `INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, payload, status, correlation_id, created_at)
         VALUES ($1, 'withdrawal.created', 'withdrawal', $2, $3, 'PENDING', $4, NOW())`,
        [`evt_${withdrawalId}`, withdrawalId, JSON.stringify({ withdrawalId, userId, amount: numericAmount }), correlationId || null]
      );

      return {
        withdrawalId,
        amount: numericAmount,
        reservedBalance: newReserved,
        availableBalance: parseFloat((currentBalance - newReserved).toFixed(2)),
      };
    });

    return {
      success: true,
      status: 'PENDING_REVIEW',
      ...result,
    };
  }

  /** Review Withdrawal Request (Admin Approval / Rejection) */
  async reviewWithdrawal({ withdrawalId, adminId, decision, reason = '' }) {
    const wRes = await query('SELECT * FROM withdrawals WHERE withdrawal_id = $1', [withdrawalId]);
    if (wRes.rows.length === 0) {
      throw new Error(`Withdrawal record ${withdrawalId} not found`);
    }

    const withdrawal = wRes.rows[0];
    if (withdrawal.status !== 'PENDING_REVIEW') {
      throw new Error(`Withdrawal ${withdrawalId} is already in status '${withdrawal.status}'`);
    }

    const amount = parseFloat(withdrawal.amount);
    const userId = withdrawal.user_id;

    if (decision === 'APPROVE') {
      await query(`UPDATE withdrawals SET status = 'APPROVED', updated_at = NOW() WHERE withdrawal_id = $1`, [withdrawalId]);
      return { success: true, withdrawalId, status: 'APPROVED' };
    }

    if (decision === 'REJECT') {
      // Reversal: Release Held Funds
      await withTransaction(async (client) => {
        const walletRes = await client.query('SELECT wallet_id, balance, reserved_balance FROM wallets WHERE user_id = $1 FOR UPDATE', [userId]);
        const wallet = walletRes.rows[0];
        const newReserved = Math.max(0, parseFloat(wallet.reserved_balance) - amount);

        await client.query('UPDATE wallets SET reserved_balance = $1, updated_at = NOW() WHERE wallet_id = $2', [newReserved, wallet.wallet_id]);
        await client.query('UPDATE withdrawals SET status = \'REJECTED\', rejection_reason = $1, updated_at = NOW() WHERE withdrawal_id = $2', [reason, withdrawalId]);

        const txId = `tx_rev_${withdrawalId}`;
        await client.query(
          `INSERT INTO transactions (transaction_id, user_id, type, amount, status, created_at)
           VALUES ($1, $2, 'WITHDRAWAL_REVERSAL', $3, 'SUCCESS', NOW())`,
          [txId, userId, amount]
        );

        await client.query(
          `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description, created_at)
           VALUES ($1, $2, 'CREDIT', $3, $4, $5, NOW())`,
          [wallet.wallet_id, txId, amount, parseFloat(wallet.balance), `Withdrawal Reversal: ${reason}`]
        );
      });

      return { success: true, withdrawalId, status: 'REJECTED' };
    }

    throw new Error(`Invalid decision '${decision}'. Must be 'APPROVE' or 'REJECT'`);
  }
}

export const withdrawalEngine = new WithdrawalEngine();
