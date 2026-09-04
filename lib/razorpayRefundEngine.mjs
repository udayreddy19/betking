/**
 * Razorpay deposit refunds — ledger-backed, idempotent wallet reversals.
 * Never mutates wallet balances outside a DB transaction with FOR UPDATE.
 */

import Razorpay from 'razorpay';
import { query, withTransaction } from '../db/pg.js';
import { idempotencyEngine } from './idempotencyEngine.mjs';
import { logger } from './logger.mjs';

function getRazorpayCredentials() {
  const key_id = process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  return { key_id, key_secret };
}

function money(n) {
  return parseFloat(Number(n).toFixed(2));
}

async function sumProcessedRefunds(client, depositId) {
  const res = await client.query(
    `SELECT COALESCE(SUM(amount), 0)::float AS total
     FROM payment_refunds
     WHERE deposit_id = $1 AND status = 'PROCESSED'`,
    [depositId],
  );
  return money(res.rows[0]?.total || 0);
}

/**
 * Initiate a full or partial refund for a captured deposit.
 * Uses Razorpay refund API (mocked in NODE_ENV=test).
 */
export async function requestDepositRefund({
  depositId,
  amount = null,
  reason = 'admin_refund',
  actorId = null,
  idempotencyKey,
  correlationId = null,
} = {}) {
  if (!depositId) {
    throw Object.assign(new Error('depositId is required'), { code: 'REFUND_INVALID', status: 400 });
  }
  if (!idempotencyKey) {
    throw Object.assign(new Error('idempotencyKey is required'), { code: 'REFUND_IDEMPOTENCY_REQUIRED', status: 400 });
  }

  const existing = await query(
    `SELECT * FROM payment_refunds WHERE idempotency_key = $1 LIMIT 1`,
    [idempotencyKey],
  );
  if (existing.rows[0]) {
    return {
      success: true,
      duplicate: true,
      refundId: existing.rows[0].refund_id,
      status: existing.rows[0].status,
      amount: money(existing.rows[0].amount),
      providerRefundId: existing.rows[0].provider_refund_id,
      transactionId: existing.rows[0].transaction_id,
    };
  }

  const depRes = await query(
    `SELECT deposit_id, user_id, amount, status, payment_id, order_id, currency,
            COALESCE(refunded_amount, 0) AS refunded_amount
     FROM deposits WHERE deposit_id = $1 OR id = $1`,
    [depositId],
  );
  if (!depRes.rows[0]) {
    throw Object.assign(new Error('Deposit not found'), { code: 'DEPOSIT_NOT_FOUND', status: 404 });
  }
  const deposit = depRes.rows[0];
  if (!['CAPTURED', 'PAID', 'PARTIALLY_REFUNDED'].includes(String(deposit.status).toUpperCase())) {
    throw Object.assign(
      new Error(`Cannot refund deposit in status '${deposit.status}'`),
      { code: 'DEPOSIT_NOT_REFUNDABLE', status: 400 },
    );
  }
  if (!deposit.payment_id) {
    throw Object.assign(new Error('Deposit has no provider payment id'), {
      code: 'PAYMENT_MISSING',
      status: 400,
    });
  }

  const depositAmount = money(deposit.amount);
  const alreadyRefunded = money(deposit.refunded_amount);
  const remaining = money(depositAmount - alreadyRefunded);
  const refundAmount = amount == null ? remaining : money(amount);

  if (!(refundAmount > 0)) {
    throw Object.assign(new Error('Refund amount must be positive'), { code: 'REFUND_INVALID_AMOUNT', status: 400 });
  }
  if (refundAmount > remaining + 0.001) {
    throw Object.assign(
      new Error(`Refund ₹${refundAmount} exceeds remaining ₹${remaining}`),
      { code: 'REFUND_EXCEEDS_REMAINING', status: 400 },
    );
  }

  const refundId = `ref_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const idemCheck = await idempotencyEngine.checkOrLock(
    idempotencyKey,
    'DEPOSIT_REFUND',
    `${deposit.deposit_id}:${refundAmount}`,
    deposit.user_id,
  );
  if (idemCheck.isDuplicate) {
    if (idemCheck.status === 'COMPLETED' && idemCheck.result) {
      return { success: true, duplicate: true, ...idemCheck.result };
    }
    throw Object.assign(new Error('Refund already in progress'), {
      code: 'REFUND_IN_PROGRESS',
      status: 409,
    });
  }

  let providerRefundId;
  try {
    if (process.env.NODE_ENV === 'test') {
      providerRefundId = `rfnd_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    } else {
      const { key_id, key_secret } = getRazorpayCredentials();
      if (!key_id || !key_secret) {
        throw Object.assign(new Error('Razorpay credentials are required'), {
          code: 'CONFIG_ERROR',
          status: 500,
        });
      }
      const instance = new Razorpay({ key_id, key_secret });
      const rzpRefund = await instance.payments.refund(deposit.payment_id, {
        amount: Math.round(refundAmount * 100),
        speed: 'normal',
        notes: {
          depositId: deposit.deposit_id,
          userId: deposit.user_id,
          actorId: actorId || '',
          reason: String(reason || '').slice(0, 200),
        },
        receipt: refundId,
      });
      providerRefundId = rzpRefund.id;
    }
  } catch (err) {
    await idempotencyEngine.fail(idempotencyKey, err.message).catch(() => null);
    throw Object.assign(new Error(err.message || 'Razorpay refund failed'), {
      code: err.code || 'REFUND_PROVIDER_FAILED',
      status: err.status || 502,
    });
  }

  // Provider refund already succeeded above. applyProcessedRefund must debit the
  // wallet or return MANUAL_REVIEW_REQUIRED (insufficient funds). On unexpected
  // apply failure we still queue MANUAL_REVIEW so ops can reconcile — no silent drop.
  let result;
  try {
    result = await applyProcessedRefund({
      refundId,
      deposit,
      refundAmount,
      providerRefundId,
      reason,
      actorId,
      idempotencyKey,
      correlationId,
      rawPayload: { source: 'api_request', providerRefundId },
    });
  } catch (err) {
    logger.error('refund_apply_failed_after_provider', {
      depositId: deposit.deposit_id,
      userId: deposit.user_id,
      providerRefundId,
      refundId,
      refundAmount,
      error: err.message || String(err),
    });
    try {
      await query(
        `INSERT INTO payment_refunds (
           refund_id, deposit_id, user_id, provider_payment_id, provider_refund_id,
           amount, currency, status, reason, actor_id, idempotency_key, transaction_id,
           raw_payload, review_notes, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,'MANUAL_REVIEW_REQUIRED',$8,$9,$10,NULL,$11,$12,NOW())
         ON CONFLICT (idempotency_key) DO UPDATE
         SET status = 'MANUAL_REVIEW_REQUIRED',
             review_notes = EXCLUDED.review_notes,
             provider_refund_id = COALESCE(payment_refunds.provider_refund_id, EXCLUDED.provider_refund_id),
             updated_at = NOW()
         WHERE UPPER(COALESCE(payment_refunds.status,'')) <> 'PROCESSED'`,
        [
          refundId,
          deposit.deposit_id,
          deposit.user_id,
          deposit.payment_id,
          providerRefundId || null,
          refundAmount,
          deposit.currency || 'INR',
          reason,
          actorId,
          idempotencyKey,
          JSON.stringify({ source: 'api_request', providerRefundId, applyError: err.message || String(err) }),
          `Provider refund ${providerRefundId} succeeded but wallet apply failed: ${err.message || err}. Finance review required.`,
        ],
      );
    } catch (markErr) {
      logger.error('refund_manual_review_mark_failed', {
        depositId: deposit.deposit_id,
        providerRefundId,
        error: markErr.message || String(markErr),
      });
    }
    await idempotencyEngine.fail(idempotencyKey, err.message).catch(() => null);
    throw err;
  }

  await idempotencyEngine.complete(idempotencyKey, result);
  return result;
}

/**
 * Apply wallet/ledger reversal once provider refund is confirmed (API or webhook).
 */
export async function applyProcessedRefund({
  refundId,
  deposit,
  refundAmount,
  providerRefundId,
  reason = 'refund',
  actorId = null,
  idempotencyKey,
  correlationId = null,
  rawPayload = null,
} = {}) {
  const amount = money(refundAmount);
  if (!(amount > 0)) {
    throw Object.assign(new Error('Invalid refund amount'), { code: 'REFUND_INVALID_AMOUNT', status: 400 });
  }

  if (providerRefundId) {
    const dup = await query(
      `SELECT refund_id, status, amount, transaction_id, provider_refund_id
       FROM payment_refunds WHERE provider_refund_id = $1 LIMIT 1`,
      [providerRefundId],
    );
    if (dup.rows[0]?.status === 'PROCESSED') {
      return {
        success: true,
        duplicate: true,
        refundId: dup.rows[0].refund_id,
        status: 'PROCESSED',
        amount: money(dup.rows[0].amount),
        providerRefundId: dup.rows[0].provider_refund_id,
        transactionId: dup.rows[0].transaction_id,
      };
    }
  }

  return withTransaction(async (client) => {
    const depLock = await client.query(
      `SELECT deposit_id, user_id, amount, status, payment_id, currency,
              COALESCE(refunded_amount, 0) AS refunded_amount
       FROM deposits WHERE deposit_id = $1 FOR UPDATE`,
      [deposit.deposit_id],
    );
    if (!depLock.rows[0]) {
      throw Object.assign(new Error('Deposit not found'), { code: 'DEPOSIT_NOT_FOUND', status: 404 });
    }
    const locked = depLock.rows[0];
    const already = await sumProcessedRefunds(client, locked.deposit_id);
    const remaining = money(money(locked.amount) - already);
    if (amount > remaining + 0.001) {
      throw Object.assign(
        new Error(`Refund ₹${amount} exceeds remaining ₹${remaining}`),
        { code: 'REFUND_EXCEEDS_REMAINING', status: 400 },
      );
    }

    if (providerRefundId) {
      const existingProvider = await client.query(
        `SELECT refund_id, status, transaction_id, amount
         FROM payment_refunds WHERE provider_refund_id = $1 FOR UPDATE`,
        [providerRefundId],
      );
      if (existingProvider.rows[0]?.status === 'PROCESSED') {
        return {
          success: true,
          duplicate: true,
          refundId: existingProvider.rows[0].refund_id,
          status: 'PROCESSED',
          amount: money(existingProvider.rows[0].amount),
          providerRefundId,
          transactionId: existingProvider.rows[0].transaction_id,
        };
      }
    }

    const walletRes = await client.query(
      `SELECT wallet_id, balance, COALESCE(locked_deposit_balance, 0) AS locked_deposit_balance
       FROM wallets WHERE user_id = $1 FOR UPDATE`,
      [locked.user_id],
    );
    if (!walletRes.rows[0]) {
      throw Object.assign(new Error('Wallet not found'), { code: 'WALLET_NOT_FOUND', status: 404 });
    }
    const wallet = walletRes.rows[0];
    const balance = money(wallet.balance);
    if (balance + 0.001 < amount) {
      // Provider may already have refunded; never invent wallet funds.
      // Persist MANUAL_REVIEW_REQUIRED (+ reconciliation case) for finance ops — no silent drop.
      const reviewId = refundId || `ref_review_${Date.now()}`;
      const reviewKey = idempotencyKey || `refund_review:${providerRefundId || reviewId}`;
      await client.query(
        `INSERT INTO payment_refunds (
           refund_id, deposit_id, user_id, provider_payment_id, provider_refund_id,
           amount, currency, status, reason, actor_id, idempotency_key, transaction_id,
           raw_payload, review_notes, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,'MANUAL_REVIEW_REQUIRED',$8,$9,$10,NULL,$11,$12,NOW())
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [
          reviewId,
          locked.deposit_id,
          locked.user_id,
          locked.payment_id,
          providerRefundId || null,
          amount,
          locked.currency || 'INR',
          reason,
          actorId,
          reviewKey,
          rawPayload ? JSON.stringify(rawPayload) : null,
          `Wallet balance ₹${balance} < refund ₹${amount}. Provider refund must not auto-debit. Finance review required.`,
        ],
      );
      try {
        await client.query(
          `INSERT INTO reconciliation_cases (
             id, reconciliation_type, entity_type, entity_id, expected_value, actual_value,
             difference, severity, status, notes
           ) VALUES ($1, 'PAYMENT_REFUND', 'deposit', $2, $3, $4, $5, 'CRITICAL', 'OPEN', $6)
           ON CONFLICT DO NOTHING`,
          [
            `case_refund_${reviewId}`,
            locked.deposit_id,
            amount,
            balance,
            money(amount - balance),
            `INSUFFICIENT_FUNDS_FOR_REFUND — MANUAL_REVIEW_REQUIRED (${reviewId})`,
          ],
        );
      } catch {
        /* reconciliation_cases optional if schema differs */
      }
      return {
        success: false,
        refundId: reviewId,
        status: 'MANUAL_REVIEW_REQUIRED',
        code: 'MANUAL_REVIEW_REQUIRED',
        amount,
        providerRefundId: providerRefundId || null,
        walletBalance: balance,
        message: 'Refund cannot auto-reverse wallet — insufficient funds. Queued for manual finance review.',
      };
    }

    const lockedDebit = Math.min(amount, money(wallet.locked_deposit_balance));
    const newBalance = money(balance - amount);
    const newLocked = money(money(wallet.locked_deposit_balance) - lockedDebit);
    const txId = providerRefundId || `tx_refund_${refundId}`;

    await client.query(
      `INSERT INTO payment_refunds (
         refund_id, deposit_id, user_id, provider_payment_id, provider_refund_id,
         amount, currency, status, reason, actor_id, idempotency_key, transaction_id, raw_payload, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'PROCESSED',$8,$9,$10,$11,$12,NOW())
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        refundId,
        locked.deposit_id,
        locked.user_id,
        locked.payment_id,
        providerRefundId || null,
        amount,
        locked.currency || 'INR',
        reason,
        actorId,
        idempotencyKey || `refund:${providerRefundId || refundId}`,
        txId,
        rawPayload ? JSON.stringify(rawPayload) : null,
      ],
    );

    const inserted = await client.query(
      `SELECT refund_id FROM payment_refunds WHERE refund_id = $1`,
      [refundId],
    );
    if (!inserted.rows[0]) {
      const byKey = await client.query(
        `SELECT refund_id, status, amount, transaction_id, provider_refund_id
         FROM payment_refunds WHERE idempotency_key = $1`,
        [idempotencyKey || `refund:${providerRefundId || refundId}`],
      );
      return {
        success: true,
        duplicate: true,
        refundId: byKey.rows[0]?.refund_id,
        status: byKey.rows[0]?.status || 'PROCESSED',
        amount: money(byKey.rows[0]?.amount || amount),
        providerRefundId: byKey.rows[0]?.provider_refund_id,
        transactionId: byKey.rows[0]?.transaction_id,
      };
    }

    await client.query(
      `UPDATE wallets
       SET balance = $1,
           locked_deposit_balance = $2,
           updated_at = NOW()
       WHERE wallet_id = $3`,
      [newBalance, newLocked, wallet.wallet_id],
    );

    await client.query(
      `INSERT INTO transactions (
         transaction_id, user_id, type, amount, status, method,
         provider_payment_id, provider_order_id, created_at
       ) VALUES ($1, $2, 'REFUND', $3, 'SUCCESS', 'razorpay_refund', $4, $5, NOW())
       ON CONFLICT (transaction_id) DO NOTHING`,
      [txId, locked.user_id, amount, providerRefundId || txId, locked.deposit_id],
    );

    await client.query(
      `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description, created_at)
       VALUES ($1, $2, 'DEBIT', $3, $4, $5, NOW())`,
      [
        wallet.wallet_id,
        txId,
        amount,
        newBalance,
        `Razorpay refund ${providerRefundId || refundId} for deposit ${locked.deposit_id}`,
      ],
    );

    const newRefundedTotal = money(already + amount);
    const newStatus = newRefundedTotal + 0.001 >= money(locked.amount)
      ? 'REFUNDED'
      : 'PARTIALLY_REFUNDED';

    await client.query(
      `UPDATE deposits
       SET status = $1, refunded_amount = $2, updated_at = NOW()
       WHERE deposit_id = $3`,
      [newStatus, newRefundedTotal, locked.deposit_id],
    );

    await client.query(
      `INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, payload, status, correlation_id, created_at)
       VALUES ($1, 'deposit.refunded', 'deposit', $2, $3, 'PENDING', $4, NOW())
       ON CONFLICT (id) DO NOTHING`,
      [
        `evt_${txId}`,
        locked.deposit_id,
        JSON.stringify({
          userId: locked.user_id,
          depositId: locked.deposit_id,
          amount,
          providerRefundId,
          newBalance,
          status: newStatus,
        }),
        correlationId || null,
      ],
    );

    return {
      success: true,
      duplicate: false,
      refundId,
      status: 'PROCESSED',
      amount,
      providerRefundId,
      transactionId: txId,
      newBalance,
      depositStatus: newStatus,
      refundedTotal: newRefundedTotal,
    };
  });
}

/**
 * Handle Razorpay refund webhooks (refund.processed / payment.refunded).
 * Signature verification is done by the caller (depositEngine / wallet route).
 */
export async function processRefundWebhookEntity(refundEntity, { correlationId = null } = {}) {
  if (!refundEntity?.id) {
    throw Object.assign(new Error('Missing refund entity'), { code: 'INVALID_PAYLOAD', status: 400 });
  }
  const providerRefundId = refundEntity.id;
  const paymentId = refundEntity.payment_id;
  const amount = money((refundEntity.amount || 0) / 100);
  const status = String(refundEntity.status || '').toLowerCase();

  if (status && status !== 'processed' && status !== 'completed') {
    return { status: 'IGNORED_STATUS', providerRefundId, refundStatus: status };
  }

  const depositRes = await query(
    `SELECT deposit_id, user_id, amount, status, payment_id, currency,
            COALESCE(refunded_amount, 0) AS refunded_amount
     FROM deposits WHERE payment_id = $1`,
    [paymentId],
  );
  if (!depositRes.rows[0]) {
    throw Object.assign(new Error('No deposit for refunded payment'), {
      code: 'DEPOSIT_NOT_FOUND',
      status: 404,
    });
  }

  const deposit = depositRes.rows[0];
  const result = await applyProcessedRefund({
    refundId: `ref_wh_${providerRefundId}`,
    deposit,
    refundAmount: amount,
    providerRefundId,
    reason: refundEntity.notes?.reason || 'webhook_refund',
    actorId: 'razorpay_webhook',
    idempotencyKey: `wh_refund:${providerRefundId}`,
    correlationId,
    rawPayload: refundEntity,
  });

  return { ...result, status: result.duplicate ? 'IGNORED_DUPLICATE' : 'SUCCESS' };
}

export const razorpayRefundEngine = {
  requestDepositRefund,
  applyProcessedRefund,
  processRefundWebhookEntity,
};
