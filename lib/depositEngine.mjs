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
      let order;
      try {
        order = await instance.orders.create({
          amount: Math.round(numericAmount * 100),
          currency,
          receipt: `rcpt_${userId}_${Date.now()}`,
          notes: { userId },
        });
      } catch (rzpErr) {
        const description = rzpErr?.error?.description
          || rzpErr?.error?.reason
          || rzpErr?.message
          || (rzpErr?.statusCode === 403
            ? 'Razorpay rejected the request (check test keys / network access to api.razorpay.com)'
            : null)
          || (rzpErr?.statusCode ? `Razorpay HTTP ${rzpErr.statusCode}` : null)
          || 'Razorpay order creation failed';
        const err = new Error(`RAZORPAY_ORDER_FAILED: ${description}`);
        err.code = 'RAZORPAY_ORDER_FAILED';
        err.status = Number(rzpErr?.statusCode) || 502;
        err.cause = rzpErr;
        throw err;
      }
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
      amountPaise: Math.round(numericAmount * 100),
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
      if (event === 'refund.processed' || event === 'payment.refunded') {
        const refundPayload = payload?.refund?.entity;
        if (!refundPayload?.id) {
          return { status: 'IGNORED_EVENT', event, reason: 'missing_refund_entity' };
        }
        const { processRefundWebhookEntity } = await import('./razorpayRefundEngine.mjs');
        return processRefundWebhookEntity(refundPayload, { correlationId });
      }
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

    return this.applyCapturedDeposit({
      paymentId,
      orderId,
      amountInINR,
      userId,
      method,
      utr,
      payload,
      correlationId,
    });
  }

  /**
   * Confirm a Checkout success callback (order|payment HMAC) and credit wallet.
   * Used when webhooks cannot reach localhost; still verifies Razorpay signature + payment status.
   */
  async confirmCheckoutPayment({
    userId,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
  }, correlationId = null) {
    if (!userId) {
      throw Object.assign(new Error('USER_UNAUTHENTICATED: User ID is required'), { status: 401 });
    }
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      throw Object.assign(new Error('INVALID_PAYLOAD: order_id, payment_id and signature are required'), { status: 400 });
    }

    const { key_id, key_secret } = getRazorpayCredentials();
    if (!key_id || !key_secret) {
      throw Object.assign(new Error('CONFIG_ERROR: Razorpay credentials are not configured'), { status: 500 });
    }

    const expectedSignature = crypto
      .createHmac('sha256', key_secret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');
    if (!timingSafeEqualStrings(expectedSignature, String(razorpaySignature))) {
      throw Object.assign(new Error('INVALID_SIGNATURE: Checkout payment signature verification failed'), {
        status: 400,
        code: 'INVALID_SIGNATURE',
      });
    }

    const depositRow = await query(
      `SELECT deposit_id, user_id, amount, status FROM deposits WHERE order_id = $1`,
      [razorpayOrderId],
    );
    if (depositRow.rows.length === 0) {
      throw Object.assign(new Error('UNKNOWN_ORDER: No deposit record for order_id'), { status: 404 });
    }
    const deposit = depositRow.rows[0];
    if (deposit.user_id !== userId) {
      throw Object.assign(new Error('USER_MISMATCH: Deposit does not belong to this user'), { status: 403 });
    }

    let payment;
    try {
      const instance = new Razorpay({ key_id, key_secret });
      payment = await instance.payments.fetch(razorpayPaymentId);
    } catch (rzpErr) {
      const description = rzpErr?.error?.description || rzpErr?.message || `Razorpay HTTP ${rzpErr?.statusCode || ''}`.trim();
      throw Object.assign(new Error(`RAZORPAY_FETCH_FAILED: ${description}`), { status: 502, code: 'RAZORPAY_FETCH_FAILED' });
    }

    if (!payment || payment.order_id !== razorpayOrderId) {
      throw Object.assign(new Error('ORDER_MISMATCH: Payment does not belong to this order'), { status: 400 });
    }
    const status = String(payment.status || '').toLowerCase();
    if (status !== 'captured' && status !== 'authorized') {
      throw Object.assign(
        new Error(`PAYMENT_NOT_CAPTURED: Razorpay payment status is '${payment.status || 'unknown'}'`),
        { status: 409, code: 'PAYMENT_NOT_CAPTURED' },
      );
    }

    const amountInINR = parseFloat((Number(payment.amount) / 100).toFixed(2));
    const method = payment.method || 'upi';
    const utr = payment.acquirer_data?.rrn || payment.acquirer_data?.upi_transaction_id || razorpayPaymentId;
    const payload = { source: 'checkout_confirm', payment: { entity: payment } };

    return this.applyCapturedDeposit({
      paymentId: razorpayPaymentId,
      orderId: razorpayOrderId,
      amountInINR,
      userId,
      method,
      utr,
      payload,
      correlationId,
    });
  }

  /** Shared wallet credit path for webhook + checkout confirmation (idempotent). */
  async applyCapturedDeposit({
    paymentId,
    orderId,
    amountInINR,
    userId,
    method,
    utr,
    payload,
    correlationId = null,
  }) {
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
      const depLock = await client.query(
        `SELECT deposit_id, user_id, amount, status, order_id
         FROM deposits WHERE order_id = $1 FOR UPDATE`,
        [orderId],
      );
      if (depLock.rows.length === 0) {
        throw new Error('UNKNOWN_ORDER: No deposit record for order_id');
      }
      const lockedDeposit = depLock.rows[0];
      if (lockedDeposit.user_id !== userId) {
        throw new Error('USER_MISMATCH: Payment userId does not match deposit record');
      }
      const lockedAmount = parseFloat(lockedDeposit.amount);
      if (Math.abs(lockedAmount - amountInINR) > 0.01) {
        throw new Error('AMOUNT_MISMATCH: Payment amount does not match deposit order');
      }
      if (String(lockedDeposit.status).toUpperCase() === 'CAPTURED') {
        return { walletId: null, newBalance: null, alreadyCaptured: true };
      }
      if (String(lockedDeposit.status).toUpperCase() !== 'CREATED') {
        throw new Error(`INVALID_DEPOSIT_STATUS: Cannot capture deposit in status '${lockedDeposit.status}'`);
      }

      const walletRes = await client.query(
        `SELECT wallet_id, balance FROM wallets WHERE user_id = $1 FOR UPDATE`,
        [userId]
      );

      if (walletRes.rows.length === 0) {
        throw new Error('WALLET_NOT_FOUND: User wallet does not exist');
      }

      const wallet = walletRes.rows[0];

      const capture = await client.query(
        `UPDATE deposits SET status = 'CAPTURED', payment_id = $1, raw_payload = $2, updated_at = NOW()
         WHERE order_id = $3 AND status = 'CREATED'
         RETURNING deposit_id`,
        [paymentId, JSON.stringify(payload), orderId]
      );
      if (capture.rowCount === 0) {
        return { walletId: wallet.wallet_id, newBalance: null, alreadyCaptured: true };
      }

      const capturedDepositId = capture.rows[0].deposit_id;

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
        `INSERT INTO transactions (transaction_id, user_id, type, amount, status, utr, method, provider_payment_id, provider_order_id, created_at)
         VALUES ($1, $2, 'DEPOSIT', $3, 'SUCCESS', $4, $5, $6, $7, NOW())
         ON CONFLICT (transaction_id) DO NOTHING`,
        [paymentId, userId, amountInINR, utr, method, paymentId, orderId]
      );

      await client.query(
        `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description, created_at)
         VALUES ($1, $2, 'CREDIT', $3, $4, 'Razorpay Deposit Successful', NOW())`,
        [wallet.wallet_id, paymentId, amountInINR, newBalance]
      );

      await client.query(
        `INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, payload, status, correlation_id, created_at)
         VALUES ($1, 'deposit.completed', 'deposit', $2, $3, 'PENDING', $4, NOW())
         ON CONFLICT (id) DO NOTHING`,
        [
          `evt_${paymentId}`,
          paymentId,
          JSON.stringify({
            userId,
            amount: amountInINR,
            paymentId,
            depositId: capturedDepositId,
            utr,
            newBalance,
            availableBalance: newBalance,
          }),
          correlationId || null,
        ]
      );

      return { walletId: wallet.wallet_id, newBalance, alreadyCaptured: false, depositId: capturedDepositId };
    });

    if (result.alreadyCaptured) {
      await idempotencyEngine.complete(paymentId, { status: 'IGNORED_DUPLICATE' });
      return { status: 'IGNORED_DUPLICATE', paymentId, message: 'Deposit already captured' };
    }

    await idempotencyEngine.complete(paymentId, result);

    void import('./supportNotify.mjs')
      .then(({ emailUserPaymentEvent }) => emailUserPaymentEvent('deposit', {
        userId,
        amount: amountInINR,
        paymentId,
        newBalance: result.newBalance,
      }))
      .catch(() => {});

    void import('./referralLoyaltyEngine.mjs')
      .then(({ tryQualifyReferralAfterDeposit }) => tryQualifyReferralAfterDeposit({
        userId,
        amount: amountInINR,
      }))
      .catch(() => {});

    void import('./depositFreebetEngine.mjs')
      .then(({ tryGrantDepositFreebet }) => tryGrantDepositFreebet({
        userId,
        depositId: result.depositId,
        amount: amountInINR,
      }))
      .catch(() => {});

    return {
      status: 'SUCCESS',
      paymentId,
      userId,
      amount: amountInINR,
      newBalance: result.newBalance,
      depositId: result.depositId,
    };
  }
}

export const depositEngine = new DepositEngine();
