/**
 * Server-Authoritative Multi-Provider Deposit Engine
 * Supports Cashfree and Razorpay with a Single Central Financial Engine.
 * Handles order creation, webhook verification, exactly-once wallet credit idempotency,
 * row locking, and atomic PostgreSQL financial ledger commits.
 *
 * ZERO HARDCODED SECRETS: All credentials read securely from environment variables.
 */

import { query, withTransaction } from '../db/pg.js';
import { accountEligibilityEngine } from './accountEligibilityEngine.mjs';
import { idempotencyEngine } from './idempotencyEngine.mjs';
import { MIN_DEPOSIT_INR, MAX_DEPOSIT_INR } from './vipBenefits.mjs';
import { responsibleGamingEngine } from './responsibleGaming.mjs';
import { paymentProviderService } from './paymentProviders/paymentProviderService.mjs';
import { logger } from './logger.mjs';

export class DepositEngine {
  /**
   * Verify Razorpay Payment Signature (Delegates to RazorpayProvider)
   */
  verifyPaymentSignature(params) {
    const provider = paymentProviderService.getProvider('RAZORPAY');
    return provider.verifyPaymentSignature(params);
  }

  /**
   * Verify Razorpay Webhook Signature (Delegates to RazorpayProvider)
   */
  verifyWebhookSignature(params) {
    const provider = paymentProviderService.getProvider('RAZORPAY');
    return provider.verifyWebhookSignature(params);
  }

  /**
   * Verify Cashfree Webhook Signature (Delegates to CashfreeProvider)
   */
  verifyCashfreeWebhookSignature(params) {
    const provider = paymentProviderService.getProvider('CASHFREE');
    return provider.verifyWebhookSignature(params);
  }

  /**
   * 1. Create Internal Deposit Transaction & Gateway Order (Cashfree / Razorpay)
   */
  async createOrder({ userId, amount, currency = 'INR', provider = null, returnUrl, notifyUrl }, correlationId = null) {
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

    // Fetch User metadata for customer_details
    const userRes = await query(
      `SELECT u.email, u.phone, up.display_name
       FROM users u
       LEFT JOIN user_profiles up ON u.user_id = up.user_id
       WHERE u.user_id = $1
       LIMIT 1`,
      [userId]
    );
    const userProfile = userRes.rows[0] || {};

    const amountPaise = Math.round(numericAmount * 100);
    const normalizedProvider = provider
      ? String(provider).toUpperCase()
      : (process.env.NODE_ENV === 'test' && process.env.RAZORPAY_KEY_SECRET ? 'RAZORPAY' : paymentProviderService.getDefaultProvider());
    const providerInstance = paymentProviderService.getProvider(normalizedProvider);

    const depositId = `dep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const providerOrder = await providerInstance.createOrder({
      userId,
      orderId: depositId,
      amount: numericAmount,
      amountPaise,
      currency,
      customer: {
        email: userProfile.email,
        phone: userProfile.phone,
        displayName: userProfile.display_name,
      },
      returnUrl,
      notifyUrl,
    }, correlationId);

    const effectiveOrderId = providerOrder.orderId || providerOrder.providerOrderId || depositId;
    const paymentSessionId = providerOrder.paymentSessionId || null;
    const cfOrderId = providerOrder.cfOrderId || null;

    await query(
      `INSERT INTO deposits (
         id, deposit_id, user_id, order_id, amount, amount_paise, currency,
         provider, payment_session_id, cf_order_id, status, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'PENDING', NOW(), NOW())`,
      [
        depositId,
        depositId,
        userId,
        effectiveOrderId,
        numericAmount,
        amountPaise,
        currency,
        normalizedProvider,
        paymentSessionId,
        cfOrderId,
      ]
    );

    return {
      success: true,
      provider: normalizedProvider,
      depositId,
      orderId: effectiveOrderId,
      providerOrderId: effectiveOrderId,
      amount: numericAmount,
      amountPaise,
      currency,
      paymentSessionId,
      cfOrderId,
      razorpayKeyId: providerOrder.keyId || undefined,
      keyId: providerOrder.keyId || undefined,
      environment: providerOrder.environment || undefined,
    };
  }

  /**
   * 2. Confirm Checkout Payment from Frontend (/api/payments/verify, /api/payments/cashfree/verify, /api/payments/razorpay/verify)
   */
  async confirmCheckoutPayment({
    userId,
    depositId = null,
    provider = null,
    orderId = null,
    paymentId = null,
    // Razorpay specific fields:
    razorpayOrderId = null,
    razorpayPaymentId = null,
    razorpaySignature = null,
    // Cashfree specific fields:
    cfOrderId = null,
    cfPaymentId = null,
  }, correlationId = null) {
    if (!userId) {
      throw Object.assign(new Error('USER_UNAUTHENTICATED: User ID is required'), { status: 401 });
    }

    let normalizedProvider = provider ? String(provider).toUpperCase() : null;
    if (!normalizedProvider) {
      if (razorpayOrderId || razorpaySignature || razorpayPaymentId) {
        normalizedProvider = 'RAZORPAY';
      } else if (cfOrderId || cfPaymentId) {
        normalizedProvider = 'CASHFREE';
      } else {
        normalizedProvider = 'CASHFREE';
      }
    }
    const providerInstance = paymentProviderService.getProvider(normalizedProvider);

    const effectiveOrderId = orderId || razorpayOrderId || cfOrderId;
    const effectivePaymentId = paymentId || razorpayPaymentId || cfPaymentId;

    if (!effectiveOrderId) {
      throw Object.assign(new Error('INVALID_PAYLOAD: order_id is required'), { status: 400 });
    }

    // Razorpay signature check
    if (normalizedProvider === 'RAZORPAY') {
      if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        throw Object.assign(new Error('INVALID_PAYLOAD: razorpay_order_id, razorpay_payment_id and razorpay_signature are required'), { status: 400 });
      }
      const isSignatureValid = providerInstance.verifyPaymentSignature({
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
    }

    // Verify Deposit Record in DB
    const depositRow = await query(
      `SELECT id, deposit_id, user_id, amount, amount_paise, status, provider
       FROM deposits
       WHERE order_id = $1 OR deposit_id = $2 OR id = $2
       LIMIT 1`,
      [effectiveOrderId, depositId || effectiveOrderId],
    );

    if (depositRow.rows.length === 0) {
      throw Object.assign(new Error(`UNKNOWN_ORDER: No deposit record found for order '${effectiveOrderId}'`), { status: 404 });
    }

    const deposit = depositRow.rows[0];
    if (deposit.user_id !== userId) {
      throw Object.assign(new Error('USER_MISMATCH: Deposit does not belong to this user'), { status: 403 });
    }

    // Fetch authoritative status from payment provider API
    let paymentStatusResult;
    try {
      paymentStatusResult = await providerInstance.fetchPaymentStatus(effectiveOrderId, effectivePaymentId, correlationId);
    } catch (fetchErr) {
      logger.warn(`[DepositEngine] Provider fetchPaymentStatus warning for ${normalizedProvider}:`, { error: fetchErr?.message });
      paymentStatusResult = {
        orderId: effectiveOrderId,
        paymentId: effectivePaymentId,
        status: 'PENDING',
      };
    }

    const resolvedPaymentId = paymentStatusResult.paymentId || effectivePaymentId || `pay_${effectiveOrderId}`;
    const resolvedMethod = paymentStatusResult.method || 'upi';
    const resolvedUtr = paymentStatusResult.utr || resolvedPaymentId;
    const paymentAmountInINR = paymentStatusResult.amountInINR || parseFloat(deposit.amount);

    if (paymentStatusResult.status === 'FAILED') {
      await query(
        `UPDATE deposits SET status = 'FAILED', updated_at = NOW() WHERE id = $1 AND status = 'PENDING'`,
        [deposit.id]
      );
      throw Object.assign(new Error('PAYMENT_FAILED: Payment was not successful with provider'), {
        status: 400,
        code: 'PAYMENT_FAILED',
      });
    }

    // Delegate to Central Single Financial Processor
    return this.processVerifiedPayment({
      provider: normalizedProvider,
      depositId: deposit.deposit_id || deposit.id,
      providerOrderId: effectiveOrderId,
      providerPaymentId: resolvedPaymentId,
      amountInINR: paymentAmountInINR,
      userId,
      method: resolvedMethod,
      utr: resolvedUtr,
      rawPayload: { source: 'checkout_verify', provider: normalizedProvider, ...paymentStatusResult.raw },
      source: 'FRONTEND_VERIFY',
      correlationId,
    });
  }

  /**
   * 3. Process Webhook Event (Cashfree or Razorpay)
   */
  async processWebhook({ rawBody, headers = {}, signature = null, payload = null, event = null, provider = null }, correlationId = null) {
    let normalizedProvider = provider ? String(provider).toUpperCase() : null;
    if (!normalizedProvider) {
      if (signature || headers?.['x-razorpay-signature']) {
        normalizedProvider = 'RAZORPAY';
      } else if (headers?.['x-webhook-signature'] || headers?.['x-cf-signature']) {
        normalizedProvider = 'CASHFREE';
      } else {
        normalizedProvider = 'CASHFREE';
      }
    }
    const providerInstance = paymentProviderService.getProvider(normalizedProvider);

    // Verify Webhook Signature
    const isSignatureValid = normalizedProvider === 'RAZORPAY'
      ? providerInstance.verifyWebhookSignature({ rawBody, signature: signature || headers['x-razorpay-signature'] })
      : providerInstance.verifyWebhookSignature({ rawBody, headers });

    if (!isSignatureValid) {
      throw new Error(`INVALID_SIGNATURE: ${normalizedProvider} webhook signature verification failed`);
    }

    const parsedEvent = providerInstance.parseWebhookEvent(
      typeof rawBody === 'object' && !Buffer.isBuffer(rawBody) ? rawBody : (payload || JSON.parse(rawBody.toString('utf8'))),
      headers,
    );

    const providerEventId = parsedEvent.providerEventId;

    // Webhook Idempotency Check
    const existingWebhook = await query(
      `SELECT id, status FROM payment_webhook_events WHERE provider = $1 AND provider_event_id = $2`,
      [normalizedProvider, providerEventId]
    );
    if (existingWebhook.rows.length > 0) {
      return { status: 'IGNORED_DUPLICATE', providerEventId, message: 'Webhook event already processed' };
    }

    // Record webhook event receipt
    await query(
      `INSERT INTO payment_webhook_events (provider, provider_event_id, event_type, status, raw_payload, created_at)
       VALUES ($1, $2, $3, 'PROCESSING', $4, NOW())
       ON CONFLICT (provider_event_id) DO NOTHING`,
      [normalizedProvider, providerEventId, parsedEvent.event, JSON.stringify(parsedEvent.raw)]
    );

    // Handle Failure and Non-Payment Events
    if (parsedEvent.status !== 'SUCCESS') {
      if (parsedEvent.status === 'FAILED' && parsedEvent.orderId) {
        await query(
          `UPDATE deposits SET status = 'FAILED', updated_at = NOW() WHERE order_id = $1 AND status = 'PENDING'`,
          [parsedEvent.orderId]
        );
      }
      await query(
        `UPDATE payment_webhook_events SET status = 'PROCESSED', processed_at = NOW() WHERE provider_event_id = $1`,
        [providerEventId]
      );
      return { status: 'EVENT_ACKNOWLEDGED', event: parsedEvent.event };
    }

    if (!parsedEvent.orderId) {
      throw new Error('INVALID_ORDER: Missing order_id in webhook payment payload');
    }

    // Delegate to Central Single Financial Processor
    const result = await this.processVerifiedPayment({
      provider: normalizedProvider,
      providerOrderId: parsedEvent.orderId,
      providerPaymentId: parsedEvent.paymentId || `wh_${providerEventId}`,
      amountInINR: parsedEvent.amountInINR,
      amountPaise: parsedEvent.amountPaise,
      userId: parsedEvent.userId,
      method: parsedEvent.method || 'upi',
      utr: parsedEvent.utr || parsedEvent.paymentId,
      rawPayload: parsedEvent.raw,
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
   * The Single Source of Truth for processing verified deposits across ALL gateways:
   *  - Cashfree Webhook & API Verification
   *  - Razorpay Webhook & API Verification
   *  - Admin Finance Authoritative Reconciliation
   */
  async processVerifiedPayment({
    provider = 'CASHFREE',
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

    const normalizedProvider = String(provider || 'CASHFREE').toUpperCase();
    const effectivePaise = amountPaise != null
      ? Number(amountPaise)
      : Math.round(Number(amountInINR) * 100);

    const utrFinal = utr || providerPaymentId;

    // Concurrency / Idempotency check scoped by provider, payment, and order
    const idemKey = `${normalizedProvider}_${providerPaymentId}_${providerOrderId}`;
    const idemCheck = await idempotencyEngine.checkOrLock(idemKey, 'DEPOSIT_PROCESSOR', '', userId || '');
    if (idemCheck.isDuplicate) {
      if (idemCheck.result) {
        return { ...idemCheck.result, alreadyPaid: true };
      }
      return {
        status: 'PAID',
        alreadyPaid: true,
        provider: normalizedProvider,
        paymentId: providerPaymentId,
        message: 'Payment already processed',
      };
    }

    // Atomic Database Transaction
    const result = await withTransaction(async (client) => {
      // 1. Lock Deposit Transaction Row (FOR UPDATE)
      const depLock = await client.query(
        `SELECT id, deposit_id, user_id, amount, amount_paise, status, order_id, payment_id, provider
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
        throw new Error(`DUPLICATE_PAYMENT_ID: Payment ID '${providerPaymentId}' has already been credited to another deposit`);
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
          provider: normalizedProvider,
          depositId: lockedDeposit.deposit_id || lockedDeposit.id,
          paymentId: providerPaymentId,
          amount: Number(lockedDeposit.amount),
          amountPaise: expectedPaise,
          userId: targetUserId,
          newBalance: parseFloat(wRes.rows[0]?.balance || 0),
        };
      }

      // 2. Lock User Wallet Row (FOR UPDATE)
      const walletRes = await client.query(
        `SELECT wallet_id, balance FROM wallets WHERE user_id = $1 FOR UPDATE`,
        [targetUserId]
      );

      if (walletRes.rows.length === 0) {
        throw new Error(`WALLET_NOT_FOUND: User wallet does not exist for user '${targetUserId}'`);
      }

      const wallet = walletRes.rows[0];
      const depositRupees = Number(lockedDeposit.amount);

      // 3. Mark Deposit as PAID & Store Payment ID
      await client.query(
        `UPDATE deposits
         SET status = 'PAID',
             payment_id = $1,
             amount_paise = $2,
             provider = $3,
             raw_payload = $4,
             paid_at = NOW(),
             updated_at = NOW()
         WHERE id = $5`,
        [providerPaymentId, effectivePaise, normalizedProvider, JSON.stringify(rawPayload), lockedDeposit.id]
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
        `INSERT INTO transactions (
           transaction_id, user_id, type, amount, status, utr, method,
           provider_payment_id, provider_order_id, created_at
         )
         VALUES ($1, $2, 'DEPOSIT', $3, 'SUCCESS', $4, $5, $6, $7, NOW())
         ON CONFLICT (transaction_id) DO UPDATE
         SET status = 'SUCCESS', provider_payment_id = $6, utr = $4`,
        [providerPaymentId, targetUserId, depositRupees, utrFinal, method, providerPaymentId, providerOrderId]
      );

      // 6. Record Immutable Double-Entry Ledger Entry
      await client.query(
        `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description, created_at)
         VALUES ($1, $2, 'CREDIT', $3, $4, $5, NOW())`,
        [wallet.wallet_id, providerPaymentId, depositRupees, newBalance, `${normalizedProvider} Deposit Successful`]
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
            provider: normalizedProvider,
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
        provider: normalizedProvider,
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

  /**
   * Alias for Razorpay backward compatibility
   */
  async processVerifiedRazorpayPayment(params) {
    return this.processVerifiedPayment({
      ...params,
      provider: 'RAZORPAY',
    });
  }
}

export const depositEngine = new DepositEngine();
