/**
 * Server-Authoritative Deposit Engine & Razorpay Integration
 * Handles order creation, webhook verification (HMAC SHA-256 with raw body),
 * exactly-once wallet credit idempotency, and atomic PostgreSQL financial ledger commits.
 *
 * ZERO HARDCODED SECRETS: All credentials read securely from environment variables.
 */

import crypto from 'crypto';
import { query, withTransaction } from '../db/pg.js';
import { accountEligibilityEngine } from './accountEligibilityEngine.mjs';
import { idempotencyEngine } from './idempotencyEngine.mjs';
import { timingSafeEqualStrings } from './cryptoUtils.mjs';
import { MIN_DEPOSIT_INR, MAX_DEPOSIT_INR } from './vipBenefits.mjs';
import { responsibleGamingEngine } from './responsibleGaming.mjs';
import { logger } from './logger.mjs';

function getRazorpayCredentials() {
  const key_id = process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  return { key_id, key_secret };
}

function getRazorpayWebhookSecret() {
  return process.env.RAZORPAY_WEBHOOK_SECRET;
}

/**
 * Native REST client for Razorpay API (zero external npm bloat)
 */
async function callRazorpayApi(endpoint, options = {}, { key_id, key_secret }) {
  const authHeader = 'Basic ' + Buffer.from(`${key_id}:${key_secret}`).toString('base64');
  const url = `https://api.razorpay.com/v1${endpoint}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
      ...(options.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errorMsg = data.error?.description || data.error?.reason || data.message || `Razorpay HTTP ${res.status}`;
    const err = new Error(`RAZORPAY_API_ERROR: ${errorMsg}`);
    err.status = res.status;
    err.details = data;
    throw err;
  }
  return data;
}

export class DepositEngine {
  /**
   * Verify Razorpay Payment Signature (HMAC-SHA256 of "order_id|payment_id" with key_secret)
   */
  verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return false;
    }
    const { key_secret } = getRazorpayCredentials();
    if (!key_secret) {
      if (process.env.NODE_ENV === 'test') return true;
      throw new Error('CONFIG_ERROR: RAZORPAY_KEY_SECRET is not configured');
    }

    const payload = `${razorpayOrderId}|${razorpayPaymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', key_secret)
      .update(payload)
      .digest('hex');

    return timingSafeEqualStrings(expectedSignature, String(razorpaySignature));
  }

  /**
   * Verify Razorpay Webhook Signature (HMAC-SHA256 of raw request body with webhook_secret)
   */
  verifyWebhookSignature({ rawBody, signature }) {
    if (!signature) {
      return false;
    }
    const webhookSecret = getRazorpayWebhookSecret();
    if (!webhookSecret) {
      if (process.env.NODE_ENV === 'test') return true;
      throw new Error('CONFIG_ERROR: RAZORPAY_WEBHOOK_SECRET is not configured');
    }

    const rawBuffer = Buffer.isBuffer(rawBody)
      ? rawBody
      : typeof rawBody === 'string'
        ? Buffer.from(rawBody, 'utf8')
        : Buffer.from(JSON.stringify(rawBody || ''), 'utf8');

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBuffer)
      .digest('hex');

    return timingSafeEqualStrings(expectedSignature, String(signature));
  }

  /**
   * 1. Create Internal Deposit Transaction & Razorpay Order
   */
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

    const amountPaise = Math.round(numericAmount * 100);
    const { key_id, key_secret } = getRazorpayCredentials();
    let razorpayOrderId;

    if (process.env.NODE_ENV === 'test' || !key_id || !key_secret) {
      if (process.env.NODE_ENV === 'production' && (!key_id || !key_secret)) {
        throw new Error('CONFIG_ERROR: Razorpay credentials are required in production');
      }
      razorpayOrderId = `order_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    } else {
      try {
        const order = await callRazorpayApi('/orders', {
          method: 'POST',
          body: JSON.stringify({
            amount: amountPaise,
            currency,
            receipt: `rcpt_${userId}_${Date.now()}`,
            notes: { userId },
          }),
        }, { key_id, key_secret });
        razorpayOrderId = order.id;
      } catch (rzpErr) {
        const description = rzpErr?.details?.error?.description
          || rzpErr?.message
          || 'Razorpay order creation failed';
        const err = new Error(`RAZORPAY_ORDER_FAILED: ${description}`);
        err.code = 'RAZORPAY_ORDER_FAILED';
        err.status = rzpErr.status || 502;
        err.cause = rzpErr;
        throw err;
      }
    }

    const depositId = `dep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await query(
      `INSERT INTO deposits (id, deposit_id, user_id, order_id, amount, amount_paise, currency, provider, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'RAZORPAY', 'PENDING', NOW(), NOW())`,
      [depositId, depositId, userId, razorpayOrderId, numericAmount, amountPaise, currency]
    );

    return {
      success: true,
      depositId,
      razorpayOrderId,
      orderId: razorpayOrderId,
      amount: numericAmount,
      amountPaise,
      currency,
      razorpayKeyId: key_id || 'rzp_test_public_key',
      keyId: key_id || 'rzp_test_public_key',
    };
  }

  /**
   * 2. Confirm Checkout Payment from Frontend (/api/payments/razorpay/verify or /api/v1/payments/confirm)
   */
  async confirmCheckoutPayment({
    userId,
    depositId = null,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
  }, correlationId = null) {
    if (!userId) {
      throw Object.assign(new Error('USER_UNAUTHENTICATED: User ID is required'), { status: 401 });
    }
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      throw Object.assign(new Error('INVALID_PAYLOAD: razorpay_order_id, razorpay_payment_id and razorpay_signature are required'), { status: 400 });
    }

    // Verify signature
    const isSignatureValid = this.verifyPaymentSignature({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    });

    if (!isSignatureValid) {
      throw Object.assign(new Error('INVALID_SIGNATURE: Payment signature verification failed'), {
        status: 400,
        code: 'INVALID_SIGNATURE',
      });
    }

    const depositRow = await query(
      `SELECT id, deposit_id, user_id, amount, amount_paise, status FROM deposits WHERE order_id = $1`,
      [razorpayOrderId],
    );
    if (depositRow.rows.length === 0) {
      throw Object.assign(new Error('UNKNOWN_ORDER: No deposit record for order_id'), { status: 404 });
    }
    const deposit = depositRow.rows[0];
    if (deposit.user_id !== userId) {
      throw Object.assign(new Error('USER_MISMATCH: Deposit does not belong to this user'), { status: 403 });
    }

    // Fetch details from Razorpay API when in non-test mode with credentials
    const { key_id, key_secret } = getRazorpayCredentials();
    let method = 'upi';
    let utr = razorpayPaymentId;
    let paymentAmountInINR = parseFloat(deposit.amount);

    if (key_id && key_secret && process.env.NODE_ENV !== 'test') {
      try {
        const payment = await callRazorpayApi(`/payments/${encodeURIComponent(razorpayPaymentId)}`, { method: 'GET' }, { key_id, key_secret });
        if (payment) {
          if (payment.order_id && payment.order_id !== razorpayOrderId) {
            throw Object.assign(new Error('ORDER_MISMATCH: Payment does not belong to this order'), { status: 400 });
          }
          const status = String(payment.status || '').toLowerCase();
          if (status !== 'captured' && status !== 'authorized') {
            throw Object.assign(
              new Error(`PAYMENT_NOT_CAPTURED: Razorpay payment status is '${payment.status || 'unknown'}'`),
              { status: 409, code: 'PAYMENT_NOT_CAPTURED' },
            );
          }
          paymentAmountInINR = parseFloat((Number(payment.amount) / 100).toFixed(2));
          method = payment.method || 'upi';
          utr = payment.acquirer_data?.rrn || payment.acquirer_data?.upi_transaction_id || razorpayPaymentId;
        }
      } catch (rzpErr) {
        if (rzpErr?.status === 400 || rzpErr?.status === 409) throw rzpErr;
        logger.warn('[DepositEngine] Razorpay API fetch warning:', { error: rzpErr?.message });
      }
    }

    // Delegate to Central Payment Processor
    return this.processVerifiedRazorpayPayment({
      depositId: deposit.deposit_id || deposit.id,
      providerOrderId: razorpayOrderId,
      providerPaymentId: razorpayPaymentId,
      amountInINR: paymentAmountInINR,
      userId,
      method,
      utr,
      rawPayload: { source: 'checkout_verify', razorpayOrderId, razorpayPaymentId },
      source: 'FRONTEND_VERIFY',
      correlationId,
    });
  }

  /**
   * 3. Process Webhook Event (/api/webhooks/razorpay)
   */
  async processWebhook({ rawBody, signature, payload, event }, correlationId = null) {
    if (!signature) {
      throw new Error('MISSING_SIGNATURE: X-Razorpay-Signature header is missing');
    }

    const isSignatureValid = this.verifyWebhookSignature({ rawBody, signature });
    if (!isSignatureValid) {
      throw new Error('INVALID_SIGNATURE: Webhook signature verification failed');
    }

    const providerEventId = payload?.payment?.entity?.id
      ? `evt_rzp_${payload.payment.entity.id}_${event}`
      : `evt_rzp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Webhook Idempotency Check
    const existingWebhook = await query(
      `SELECT id, status FROM payment_webhook_events WHERE provider_event_id = $1`,
      [providerEventId]
    );
    if (existingWebhook.rows.length > 0) {
      return { status: 'IGNORED_DUPLICATE', providerEventId, message: 'Webhook event already processed' };
    }

    // Record webhook event receipt
    await query(
      `INSERT INTO payment_webhook_events (provider, provider_event_id, event_type, status, raw_payload, created_at)
       VALUES ('RAZORPAY', $1, $2, 'PROCESSING', $3, NOW())
       ON CONFLICT (provider_event_id) DO NOTHING`,
      [providerEventId, event, JSON.stringify({ event, payload })]
    );

    if (event !== 'payment.captured' && event !== 'order.paid') {
      if (event === 'refund.processed' || event === 'payment.refunded') {
        const refundPayload = payload?.refund?.entity;
        if (refundPayload?.id) {
          const { processRefundWebhookEntity } = await import('./razorpayRefundEngine.mjs');
          await processRefundWebhookEntity(refundPayload, { correlationId });
        }
      } else if (event === 'payment.failed') {
        const failedPayment = payload?.payment?.entity;
        if (failedPayment?.order_id) {
          await query(
            `UPDATE deposits SET status = 'FAILED', updated_at = NOW() WHERE order_id = $1 AND status = 'PENDING'`,
            [failedPayment.order_id]
          );
        }
      }
      await query(
        `UPDATE payment_webhook_events SET status = 'PROCESSED', processed_at = NOW() WHERE provider_event_id = $1`,
        [providerEventId]
      );
      return { status: 'EVENT_ACKNOWLEDGED', event };
    }

    const payment = payload?.payment?.entity;
    if (!payment) {
      throw new Error('INVALID_PAYLOAD: Missing payment entity');
    }

    const paymentId = payment.id;
    const orderId = payment.order_id;
    const amountInINR = parseFloat((Number(payment.amount) / 100).toFixed(2));
    const userId = payment.notes?.userId;
    const method = payment.method || 'upi';
    const utr = payment.acquirer_data?.rrn || payment.acquirer_data?.upi_transaction_id || paymentId;

    if (!orderId) {
      throw new Error('INVALID_ORDER: Missing order_id in payment payload');
    }

    const result = await this.processVerifiedRazorpayPayment({
      providerOrderId: orderId,
      providerPaymentId: paymentId,
      amountInINR,
      userId,
      method,
      utr,
      rawPayload: payload,
      source: 'WEBHOOK',
      correlationId,
    });

    await query(
      `UPDATE payment_webhook_events SET status = 'PROCESSED', processed_at = NOW() WHERE provider_event_id = $1`,
      [providerEventId]
    );

    return result;
  }

  /**
   * 4. CENTRAL PAYMENT PROCESSOR — EXACTLY-ONCE WALLET CREDIT & ATOMIC LEDGER COMMIT
   *
   * The Single Source of Truth for processing verified deposits from:
   *  - Frontend /api/payments/razorpay/verify
   *  - Webhook /api/webhooks/razorpay
   *  - Admin /api/admin/finance/razorpay/reconcile/:orderId
   */
  async processVerifiedRazorpayPayment({
    depositId = null,
    providerOrderId,
    providerPaymentId,
    amountInINR,
    amountPaise = null,
    userId = null,
    method = 'upi',
    utr = null,
    rawPayload = {},
    source = 'SYSTEM',
    correlationId = null,
  }) {
    if (!providerOrderId || !providerPaymentId) {
      throw new Error('MISSING_PARAMETERS: providerOrderId and providerPaymentId are required');
    }

    const effectivePaise = amountPaise != null
      ? Number(amountPaise)
      : Math.round(Number(amountInINR) * 100);

    const utrFinal = utr || providerPaymentId;

    // Concurrency / Idempotency check scoped by payment and order
    const idemKey = `${providerPaymentId}_${providerOrderId}`;
    const idemCheck = await idempotencyEngine.checkOrLock(idemKey, 'DEPOSIT_PROCESSOR', '', userId || '');
    if (idemCheck.isDuplicate) {
      if (idemCheck.result) {
        return { ...idemCheck.result, alreadyPaid: true };
      }
      return {
        status: 'PAID',
        alreadyPaid: true,
        paymentId: providerPaymentId,
        message: 'Payment already processed',
      };
    }

    // Atomic Database Transaction
    const result = await withTransaction(async (client) => {
      // 1. Lock Deposit Transaction Row
      const depLock = await client.query(
        `SELECT id, deposit_id, user_id, amount, amount_paise, status, order_id, payment_id
         FROM deposits
         WHERE order_id = $1 ${depositId ? 'OR deposit_id = $2 OR id = $2' : ''}
         FOR UPDATE`,
        depositId ? [providerOrderId, depositId] : [providerOrderId],
      );

      if (depLock.rows.length === 0) {
        throw new Error(`UNKNOWN_ORDER: No deposit record found for order '${providerOrderId}'`);
      }

      const lockedDeposit = depLock.rows[0];
      const targetUserId = lockedDeposit.user_id;

      if (userId && targetUserId !== userId) {
        throw new Error('USER_MISMATCH: Payment userId does not match deposit record');
      }

      // Check if providerPaymentId has already credited another order
      const dupCheck = await client.query(
        `SELECT id, deposit_id, order_id FROM deposits WHERE payment_id = $1 AND status IN ('PAID', 'CAPTURED')`,
        [providerPaymentId]
      );
      if (dupCheck.rows.length > 0 && dupCheck.rows[0].order_id !== providerOrderId) {
        throw new Error(`DUPLICATE_PAYMENT_ID: Razorpay Payment ID '${providerPaymentId}' has already been credited to another deposit`);
      }

      // Check amount matching (integer paise comparison)
      const expectedPaise = lockedDeposit.amount_paise != null
        ? Number(lockedDeposit.amount_paise)
        : Math.round(Number(lockedDeposit.amount) * 100);

      if (effectivePaise !== expectedPaise) {
        throw new Error(`AMOUNT_MISMATCH: Payment amount (${effectivePaise} paise) does not match deposit order (${expectedPaise} paise)`);
      }

      const currentStatus = String(lockedDeposit.status).toUpperCase();

      // Exactly-Once Check: If already PAID / CAPTURED, return idempotent success
      if (currentStatus === 'PAID' || currentStatus === 'CAPTURED') {
        const wRes = await client.query(`SELECT balance FROM wallets WHERE user_id = $1`, [targetUserId]);
        return {
          status: 'PAID',
          alreadyPaid: true,
          depositId: lockedDeposit.deposit_id || lockedDeposit.id,
          paymentId: providerPaymentId,
          amount: Number(lockedDeposit.amount),
          amountPaise: expectedPaise,
          userId: targetUserId,
          newBalance: parseFloat(wRes.rows[0]?.balance || 0),
        };
      }

      // 2. Lock User Wallet Row
      const walletRes = await client.query(
        `SELECT wallet_id, balance FROM wallets WHERE user_id = $1 FOR UPDATE`,
        [targetUserId]
      );

      if (walletRes.rows.length === 0) {
        throw new Error(`WALLET_NOT_FOUND: User wallet does not exist for user '${targetUserId}'`);
      }

      const wallet = walletRes.rows[0];
      const currentBalance = parseFloat(wallet.balance);
      const depositRupees = Number(lockedDeposit.amount);

      // 3. Mark Deposit as PAID & Store Payment ID
      await client.query(
        `UPDATE deposits
         SET status = 'PAID',
             payment_id = $1,
             amount_paise = $2,
             raw_payload = $3,
             paid_at = NOW(),
             updated_at = NOW()
         WHERE id = $4`,
        [providerPaymentId, effectivePaise, JSON.stringify(rawPayload), lockedDeposit.id]
      );

      // 4. Credit Cash Wallet Balance
      const newBalanceRes = await client.query(
        `UPDATE wallets
         SET balance = balance + $1,
             locked_deposit_balance = COALESCE(locked_deposit_balance, 0) + $1,
             updated_at = NOW()
         WHERE wallet_id = $2
         RETURNING balance`,
        [depositRupees, wallet.wallet_id],
      );
      const newBalance = parseFloat(newBalanceRes.rows[0].balance);

      // 5. Record in Transactions Table
      await client.query(
        `INSERT INTO transactions (transaction_id, user_id, type, amount, status, utr, method, provider_payment_id, provider_order_id, created_at)
         VALUES ($1, $2, 'DEPOSIT', $3, 'SUCCESS', $4, $5, $6, $7, NOW())
         ON CONFLICT (transaction_id) DO UPDATE
         SET status = 'SUCCESS', provider_payment_id = $6, utr = $4`,
        [providerPaymentId, targetUserId, depositRupees, utrFinal, method, providerPaymentId, providerOrderId]
      );

      // 6. Record Immutable Double-Entry Ledger Entry
      await client.query(
        `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description, created_at)
         VALUES ($1, $2, 'CREDIT', $3, $4, 'Razorpay Deposit Successful', NOW())`,
        [wallet.wallet_id, providerPaymentId, depositRupees, newBalance]
      );

      // 7. Write Outbox Event for Message Broker / Realtime Telemetry
      await client.query(
        `INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, payload, status, correlation_id, created_at)
         VALUES ($1, 'deposit.completed', 'deposit', $2, $3, 'PENDING', $4, NOW())
         ON CONFLICT (id) DO NOTHING`,
        [
          `evt_${providerPaymentId}`,
          providerPaymentId,
          JSON.stringify({
            userId: targetUserId,
            amount: depositRupees,
            amountPaise: effectivePaise,
            paymentId: providerPaymentId,
            depositId: lockedDeposit.deposit_id || lockedDeposit.id,
            utr: utrFinal,
            source,
            newBalance,
          }),
          correlationId || null,
        ]
      );

      return {
        status: 'PAID',
        alreadyPaid: false,
        depositId: lockedDeposit.deposit_id || lockedDeposit.id,
        paymentId: providerPaymentId,
        amount: depositRupees,
        amountPaise: effectivePaise,
        userId: targetUserId,
        newBalance,
      };
    });

    await idempotencyEngine.complete(idemKey, result);

    if (!result.alreadyPaid) {
      // Async post-deposit actions (non-blocking)
      void import('./supportNotify.mjs')
        .then(({ emailUserPaymentEvent }) => emailUserPaymentEvent('deposit', {
          userId: result.userId,
          amount: result.amount,
          paymentId: result.paymentId,
          newBalance: result.newBalance,
        }))
        .catch(() => {});

      void import('./referralLoyaltyEngine.mjs')
        .then(({ tryQualifyReferralAfterDeposit }) => tryQualifyReferralAfterDeposit({
          userId: result.userId,
          amount: result.amount,
        }))
        .catch(() => {});

      void import('./depositFreebetEngine.mjs')
        .then(({ tryGrantDepositFreebet }) => tryGrantDepositFreebet({
          userId: result.userId,
          depositId: result.depositId,
          amount: result.amount,
        }))
        .catch(() => {});
    }

    return result;
  }
}

export const depositEngine = new DepositEngine();
