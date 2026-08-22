/**
 * Server-Authoritative Deposit Engine & Razorpay Integration
 * Handles order creation, webhook verification (HMAC SHA-256), idempotency, and atomic PostgreSQL financial commits.
 */

import crypto from 'crypto';
import Razorpay from 'razorpay';
import { query, withTransaction } from '../db/pg.js';
import { accountEligibilityEngine } from './accountEligibilityEngine.mjs';
import { idempotencyEngine } from './idempotencyEngine.mjs';
import { timingSafeEqualStrings } from './cryptoUtils.mjs';
import { MIN_DEPOSIT_INR, MAX_DEPOSIT_INR } from './vipBenefits.mjs';
import { responsibleGamingEngine } from './responsibleGaming.mjs';

function getRazorpayCredentials() {
  const key_id = process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  return { key_id, key_secret };
}

export class DepositEngine {
  /** Create Razorpay Deposit Order */
  async createOrder({ userId, amount, currency = 'INR' }, correlationId = null) {
    if (!userId) {
      throw new Error('USER_UNAUTHENTICATED: User ID is required');
    }

    await accountEligibilityEngine.verifyEligibility(userId);

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      throw new Error('INVALID_AMOUNT: Deposit amount must be a positive number');
    }

    const strAmount = String(numericAmount);
    if (strAmount.includes('.') && strAmount.split('.')[1].length > 2) {
      throw new Error('INVALID_AMOUNT: Deposit amount cannot exceed 2 decimal places');
    }
    if (numericAmount < MIN_DEPOSIT_INR) {
      throw new Error(`DEPOSIT_LIMIT: Minimum deposit is ₹${MIN_DEPOSIT_INR}`);
    }
    if (numericAmount > MAX_DEPOSIT_INR) {
      throw new Error(`DEPOSIT_LIMIT: Maximum deposit is ₹${MAX_DEPOSIT_INR}`);
    }

    const rgDeposit = await responsibleGamingEngine.validateDepositAttempt(userId, numericAmount);
    if (!rgDeposit.allowed) {
      throw Object.assign(
        new Error(`${rgDeposit.reason}: ${rgDeposit.message || rgDeposit.reason}`),
        { code: rgDeposit.reason, status: 403 },
      );
    }

    const { key_id, key_secret } = getRazorpayCredentials();
    let razorpayOrderId;

    if (process.env.NODE_ENV === 'test') {
      razorpayOrderId = `order_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    } else {
      if (!key_id || !key_secret) {
        if (process.env.NODE_ENV === 'production') {
          throw new Error('CONFIG_ERROR: Razorpay credentials are required in production');
        }
        throw new Error('CONFIG_ERROR: Razorpay credentials are not configured');
      }

      const instance = new Razorpay({ key_id, key_secret });
      const order = await instance.orders.create({
        amount: Math.round(numericAmount * 100),
        currency,
        receipt: `rcpt_${userId}_${Date.now()}`,
        notes: { userId },
      });
      razorpayOrderId = order.id;
    }

    const depositId = `dep_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await query(
      `INSERT INTO deposits (id, deposit_id, user_id, order_id, amount, currency, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'CREATED', NOW())`,
      [depositId, depositId, userId, razorpayOrderId, numericAmount, currency]
    );

    return {
      success: true,
      depositId,
      orderId: razorpayOrderId,
      amount: numericAmount,
      currency,
      keyId: key_id || 'rzp_test_key',
    };
  }

  /** Process Verified Razorpay Webhook */
  async processWebhook({ rawBody, signature, payload, event }, correlationId = null) {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error('CONFIG_ERROR: RAZORPAY_WEBHOOK_SECRET is required but not configured');
    }

    if (!signature) {
      throw new Error('MISSING_SIGNATURE: X-Razorpay-Signature header is missing');
    }

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody || '')
      .digest('hex');

    if (!timingSafeEqualStrings(expectedSignature, signature)) {
      throw new Error('INVALID_SIGNATURE: Webhook signature verification failed');
    }

    if (event !== 'payment.captured') {
      return { status: 'IGNORED_EVENT', event };
    }

    const payment = payload?.payment?.entity;
    if (!payment) {
      throw new Error('INVALID_PAYLOAD: Missing payment entity');
    }

    const paymentId = payment.id;
    const orderId = payment.order_id;
    const amountInINR = parseFloat((payment.amount / 100).toFixed(2));
    const userId = payment.notes?.userId;
    const method = payment.method || 'upi';
    const utr = payment.acquirer_data?.rrn || payment.acquirer_data?.upi_transaction_id || paymentId;

    if (!userId || typeof userId !== 'string' || !/^[a-zA-Z0-9_\-\.\@]+$/.test(userId)) {
      throw new Error('INVALID_USER_ID: Malformed or missing userId in payment notes');
    }

    if (!orderId) {
      throw new Error('INVALID_ORDER: Missing order_id in payment payload');
    }

    const depositRow = await query(
      `SELECT deposit_id, user_id, amount, status FROM deposits WHERE order_id = $1`,
      [orderId]
    );
    if (depositRow.rows.length === 0) {
      throw new Error('UNKNOWN_ORDER: No deposit record for order_id');
    }

    const deposit = depositRow.rows[0];
    if (deposit.user_id !== userId) {
      throw new Error('USER_MISMATCH: Payment userId does not match deposit record');
    }

    const expectedAmount = parseFloat(deposit.amount);
    if (Math.abs(expectedAmount - amountInINR) > 0.01) {
      throw new Error('AMOUNT_MISMATCH: Payment amount does not match deposit order');
    }

    const idemCheck = await idempotencyEngine.checkOrLock(paymentId, 'DEPOSIT_WEBHOOK', '', userId);
    if (idemCheck.isDuplicate) {
      return { status: 'IGNORED_DUPLICATE', paymentId, message: 'Payment webhook already processed' };
    }

    const existingTx = await query(
      `SELECT transaction_id FROM transactions WHERE provider_payment_id = $1 OR utr = $2`,
      [paymentId, utr]
    );
    if (existingTx.rows.length > 0) {
      await idempotencyEngine.complete(paymentId, { status: 'IGNORED_DUPLICATE' });
      return { status: 'IGNORED_DUPLICATE', paymentId, message: 'Payment already recorded' };
    }

    const result = await withTransaction(async (client) => {
      const walletRes = await client.query(
        `SELECT wallet_id, balance FROM wallets WHERE user_id = $1 FOR UPDATE`,
        [userId]
      );

      if (walletRes.rows.length === 0) {
        throw new Error('WALLET_NOT_FOUND: User wallet does not exist');
      }

      const wallet = walletRes.rows[0];

      const newBalanceRes = await client.query(
        `UPDATE wallets
         SET balance = balance + $1,
             locked_deposit_balance = COALESCE(locked_deposit_balance, 0) + $1,
             updated_at = NOW()
         WHERE wallet_id = $2
         RETURNING balance`,
        [amountInINR, wallet.wallet_id],
      );
      const newBalance = parseFloat(newBalanceRes.rows[0].balance);

      await client.query(
        `UPDATE deposits SET status = 'CAPTURED', payment_id = $1, raw_payload = $2, updated_at = NOW() WHERE order_id = $3`,
        [paymentId, JSON.stringify(payload), orderId]
      );

      await client.query(
        `INSERT INTO transactions (transaction_id, user_id, type, amount, status, utr, method, provider_payment_id, provider_order_id, created_at)
         VALUES ($1, $2, 'DEPOSIT', $3, 'SUCCESS', $4, $5, $6, $7, NOW())`,
        [paymentId, userId, amountInINR, utr, method, paymentId, orderId]
      );

      await client.query(
        `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description, created_at)
         VALUES ($1, $2, 'CREDIT', $3, $4, 'Razorpay Deposit Successful', NOW())`,
        [wallet.wallet_id, paymentId, amountInINR, newBalance]
      );

      await client.query(
        `INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, payload, status, correlation_id, created_at)
         VALUES ($1, 'deposit.completed', 'deposit', $2, $3, 'PENDING', $4, NOW())`,
        [
          `evt_${paymentId}`,
          paymentId,
          JSON.stringify({
            userId,
            amount: amountInINR,
            paymentId,
            utr,
            newBalance,
            availableBalance: newBalance,
          }),
          correlationId || null,
        ]
      );

      return { walletId: wallet.wallet_id, newBalance };
    });

    await idempotencyEngine.complete(paymentId, result);

    return {
      status: 'SUCCESS',
      paymentId,
      userId,
      amount: amountInINR,
      newBalance: result.newBalance,
    };
  }
}

export const depositEngine = new DepositEngine();
