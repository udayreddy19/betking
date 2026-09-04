/**
 * Razorpay deposit refunds — ledger-backed, idempotent wallet reversals.
 * Never mutates wallet balances outside a DB transaction with FOR UPDATE.
 *
 * Provider-first order (not wallet-hold-first):
 * - Webhooks arrive after Razorpay has already moved money; API and webhook share
 *   applyProcessedRefund, so a wallet-debit-before-provider saga cannot cover webhooks
 *   without a separate release path and double-apply risk on provider_refund_id.
 * - Hardening: persist PROCESSING intent before the provider call; pre-check wallet on
 *   the API path (MANUAL_REVIEW without calling provider if funds are gone); after
 *   provider success any wallet failure is durable MANUAL_REVIEW_REQUIRED + recon case.
 */

import Razorpay from 'razorpay';
import { query, withTransaction } from '../db/pg.js';
import { idempotencyEngine } from './idempotencyEngine.mjs';
import { logger } from './logger.mjs';
import { toPaise, fromPaise, roundInr } from './money.mjs';

function getRazorpayCredentials() {
  const key_id = process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  return { key_id, key_secret };
}

function money(n) {
  return roundInr(n);
}

function refundReconPayload({
  source,
  providerRefundId = null,
  applyError = null,
  walletBalance = null,
  refundAmount = null,
  depositId = null,
  userId = null,
  extra = null,
} = {}) {
  return {
    source,
    providerRefundId,
    depositId,
    userId,
    amountInr: refundAmount != null ? money(refundAmount) : null,
    amountPaise: refundAmount != null ? toPaise(refundAmount) : null,
    walletBalanceInr: walletBalance != null ? money(walletBalance) : null,
    walletBalancePaise: walletBalance != null ? toPaise(walletBalance) : null,
    applyError: applyError || null,
    needsReconciliation: true,
    orphanRisk: Boolean(providerRefundId),
    ...(extra && typeof extra === 'object' ? extra : {}),
  };
}

async function ensureRefundReconciliationCase(clientOrNull, {
  reviewId,
  depositId,
  expectedAmount,
  actualBalance,
  notes,
}) {
  const exec = clientOrNull
    ? (sql, params) => clientOrNull.query(sql, params)
    : (sql, params) => query(sql, params);
  try {
    await exec(
      `INSERT INTO reconciliation_cases (
         id, reconciliation_type, entity_type, entity_id, expected_value, actual_value,
         difference, severity, status, notes
       ) VALUES ($1, 'PAYMENT_REFUND', 'deposit', $2, $3, $4, $5, 'CRITICAL', 'OPEN', $6)
       ON CONFLICT DO NOTHING`,
      [
        `case_refund_${reviewId}`,
        depositId,
        money(expectedAmount),
        money(actualBalance),
        money(money(expectedAmount) - money(actualBalance)),
        notes,
      ],
    );
  } catch {
    /* reconciliation_cases optional if schema differs */
  }
}

async function upsertManualReviewRefund({
  refundId,
  deposit,
  providerRefundId,
  refundAmount,
  reason,
  actorId,
  idempotencyKey,
  reviewNotes,
  rawPayload,
  client = null,
}) {
  const exec = client
    ? (sql, params) => client.query(sql, params)
    : (sql, params) => query(sql, params);
  await exec(
    `INSERT INTO payment_refunds (
       refund_id, deposit_id, user_id, provider_payment_id, provider_refund_id,
       amount, currency, status, reason, actor_id, idempotency_key, transaction_id,
       raw_payload, review_notes, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,'MANUAL_REVIEW_REQUIRED',$8,$9,$10,NULL,$11,$12,NOW())
     ON CONFLICT (idempotency_key) DO UPDATE
     SET status = 'MANUAL_REVIEW_REQUIRED',
         review_notes = EXCLUDED.review_notes,
         provider_refund_id = COALESCE(payment_refunds.provider_refund_id, EXCLUDED.provider_refund_id),
         raw_payload = COALESCE(EXCLUDED.raw_payload, payment_refunds.raw_payload),
         updated_at = NOW()
     WHERE UPPER(COALESCE(payment_refunds.status,'')) <> 'PROCESSED'`,
    [
      refundId,
      deposit.deposit_id,
      deposit.user_id,
      deposit.payment_id,
      providerRefundId || null,
      money(refundAmount),
      deposit.currency || 'INR',
      reason,
      actorId,
      idempotencyKey,
      rawPayload ? JSON.stringify(rawPayload) : null,
      reviewNotes,
    ],
  );
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

function duplicateResult(row) {
  return {
    success: row.status === 'PROCESSED',
    duplicate: true,
    refundId: row.refund_id,
    status: row.status,
    amount: money(row.amount),
    providerRefundId: row.provider_refund_id,
    transactionId: row.transaction_id,
  };
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
    const row = existing.rows[0];
    const st = String(row.status || '').toUpperCase();
    // Crash recovery: provider succeeded, wallet apply never finished.
    if (st === 'PROCESSING' && row.provider_refund_id) {
      const dep = await query(
        `SELECT deposit_id, user_id, amount, status, payment_id, order_id, currency,
                COALESCE(refunded_amount, 0) AS refunded_amount
         FROM deposits WHERE deposit_id = $1`,
        [row.deposit_id],
      );
      if (dep.rows[0]) {
        const resumed = await applyProcessedRefund({
          refundId: row.refund_id,
          deposit: dep.rows[0],
          refundAmount: money(row.amount),
          providerRefundId: row.provider_refund_id,
          reason: row.reason || reason,
          actorId: row.actor_id || actorId,
          idempotencyKey,
          correlationId,
          rawPayload: { source: 'api_resume', providerRefundId: row.provider_refund_id },
        });
        await idempotencyEngine.complete(idempotencyKey, resumed).catch(() => null);
        return resumed;
      }
    }
    return duplicateResult(row);
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

  if (!(toPaise(refundAmount) > 0)) {
    throw Object.assign(new Error('Refund amount must be positive'), { code: 'REFUND_INVALID_AMOUNT', status: 400 });
  }
  if (toPaise(refundAmount) > toPaise(remaining)) {
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

  // API pre-check: do not call provider if wallet cannot reverse — prevents orphan
  // (provider paid customer while internal ledger cannot debit).
  const walletPre = await query(
    `SELECT balance FROM wallets WHERE user_id = $1`,
    [deposit.user_id],
  );
  const walletBalance = money(walletPre.rows[0]?.balance || 0);
  if (!walletPre.rows[0] || toPaise(walletBalance) < toPaise(refundAmount)) {
    const reviewPayload = refundReconPayload({
      source: 'api_precheck_insufficient_funds',
      refundAmount,
      walletBalance,
      depositId: deposit.deposit_id,
      userId: deposit.user_id,
      providerRefundId: null,
    });
    logger.warn('refund_manual_review_precheck', reviewPayload);
    await upsertManualReviewRefund({
      refundId,
      deposit,
      providerRefundId: null,
      refundAmount,
      reason,
      actorId,
      idempotencyKey,
      reviewNotes: `Wallet balance ₹${walletBalance} < refund ₹${refundAmount}. Provider not called. Finance review required.`,
      rawPayload: reviewPayload,
    });
    await ensureRefundReconciliationCase(null, {
      reviewId: refundId,
      depositId: deposit.deposit_id,
      expectedAmount: refundAmount,
      actualBalance: walletBalance,
      notes: `INSUFFICIENT_FUNDS_FOR_REFUND — MANUAL_REVIEW_REQUIRED (${refundId}); provider_not_called`,
    });
    const result = {
      success: false,
      refundId,
      status: 'MANUAL_REVIEW_REQUIRED',
      code: 'MANUAL_REVIEW_REQUIRED',
      amount: refundAmount,
      amountPaise: toPaise(refundAmount),
      providerRefundId: null,
      walletBalance,
      message: 'Refund cannot auto-reverse wallet — insufficient funds. Queued for manual finance review (provider not called).',
    };
    await idempotencyEngine.complete(idempotencyKey, result).catch(() => null);
    return result;
  }

  // Durable intent before provider call — crash between provider success and apply
  // leaves PROCESSING + later provider_refund_id for resume / recon.
  await query(
    `INSERT INTO payment_refunds (
       refund_id, deposit_id, user_id, provider_payment_id, provider_refund_id,
       amount, currency, status, reason, actor_id, idempotency_key, transaction_id,
       raw_payload, updated_at
     ) VALUES ($1,$2,$3,$4,NULL,$5,$6,'PROCESSING',$7,$8,$9,NULL,$10,NOW())
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [
      refundId,
      deposit.deposit_id,
      deposit.user_id,
      deposit.payment_id,
      refundAmount,
      deposit.currency || 'INR',
      reason,
      actorId,
      idempotencyKey,
      JSON.stringify(refundReconPayload({
        source: 'api_processing_intent',
        refundAmount,
        walletBalance,
        depositId: deposit.deposit_id,
        userId: deposit.user_id,
      })),
    ],
  );

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
        amount: toPaise(refundAmount),
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
    await query(
      `UPDATE payment_refunds
       SET status = 'FAILED', review_notes = $2, updated_at = NOW()
       WHERE idempotency_key = $1 AND UPPER(status) = 'PROCESSING'`,
      [idempotencyKey, `Provider refund failed: ${err.message || err}`],
    ).catch(() => null);
    await idempotencyEngine.fail(idempotencyKey, err.message).catch(() => null);
    throw Object.assign(new Error(err.message || 'Razorpay refund failed'), {
      code: err.code || 'REFUND_PROVIDER_FAILED',
      status: err.status || 502,
    });
  }

  await query(
    `UPDATE payment_refunds
     SET provider_refund_id = $2,
         raw_payload = $3,
         updated_at = NOW()
     WHERE idempotency_key = $1 AND UPPER(status) = 'PROCESSING'`,
    [
      idempotencyKey,
      providerRefundId,
      JSON.stringify(refundReconPayload({
        source: 'api_provider_succeeded_awaiting_wallet',
        providerRefundId,
        refundAmount,
        walletBalance,
        depositId: deposit.deposit_id,
        userId: deposit.user_id,
        orphanRisk: true,
      })),
    ],
  );

  logger.info('refund_provider_succeeded', {
    depositId: deposit.deposit_id,
    userId: deposit.user_id,
    refundId,
    providerRefundId,
    amountInr: refundAmount,
    amountPaise: toPaise(refundAmount),
    phase: 'awaiting_wallet_apply',
  });

  // Provider refund already succeeded above. applyProcessedRefund must debit the
  // wallet or return MANUAL_REVIEW_REQUIRED. On unexpected apply failure we still
  // queue MANUAL_REVIEW so ops can reconcile — no silent drop.
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
    const failPayload = refundReconPayload({
      source: 'api_apply_failed_after_provider',
      providerRefundId,
      applyError: err.message || String(err),
      refundAmount,
      walletBalance,
      depositId: deposit.deposit_id,
      userId: deposit.user_id,
    });
    logger.error('refund_apply_failed_after_provider', failPayload);
    try {
      await upsertManualReviewRefund({
        refundId,
        deposit,
        providerRefundId,
        refundAmount,
        reason,
        actorId,
        idempotencyKey,
        reviewNotes: `Provider refund ${providerRefundId} succeeded but wallet apply failed: ${err.message || err}. Finance review required.`,
        rawPayload: failPayload,
      });
      await ensureRefundReconciliationCase(null, {
        reviewId: refundId,
        depositId: deposit.deposit_id,
        expectedAmount: refundAmount,
        actualBalance: walletBalance,
        notes: `APPLY_FAILED_AFTER_PROVIDER — MANUAL_REVIEW_REQUIRED (${refundId}); provider_refund_id=${providerRefundId}`,
      });
    } catch (markErr) {
      logger.error('refund_manual_review_mark_failed', {
        depositId: deposit.deposit_id,
        providerRefundId,
        amountPaise: toPaise(refundAmount),
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
  if (!(toPaise(amount) > 0)) {
    throw Object.assign(new Error('Invalid refund amount'), { code: 'REFUND_INVALID_AMOUNT', status: 400 });
  }

  if (providerRefundId) {
    const dup = await query(
      `SELECT refund_id, status, amount, transaction_id, provider_refund_id
       FROM payment_refunds WHERE provider_refund_id = $1 LIMIT 1`,
      [providerRefundId],
    );
    if (dup.rows[0]?.status === 'PROCESSED') {
      return duplicateResult(dup.rows[0]);
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
    if (toPaise(amount) > toPaise(remaining)) {
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
    if (toPaise(balance) < toPaise(amount)) {
      // Provider may already have refunded; never invent wallet funds.
      const reviewId = refundId || `ref_review_${Date.now()}`;
      const reviewKey = idempotencyKey || `refund_review:${providerRefundId || reviewId}`;
      const reviewPayload = refundReconPayload({
        source: 'apply_insufficient_funds',
        providerRefundId,
        refundAmount: amount,
        walletBalance: balance,
        depositId: locked.deposit_id,
        userId: locked.user_id,
        extra: rawPayload && typeof rawPayload === 'object' ? { upstream: rawPayload } : null,
      });
      logger.warn('refund_manual_review_insufficient_funds', reviewPayload);
      await upsertManualReviewRefund({
        refundId: reviewId,
        deposit: locked,
        providerRefundId,
        refundAmount: amount,
        reason,
        actorId,
        idempotencyKey: reviewKey,
        reviewNotes: `Wallet balance ₹${balance} < refund ₹${amount}. Provider refund must not auto-debit. Finance review required.`,
        rawPayload: reviewPayload,
        client,
      });
      await ensureRefundReconciliationCase(client, {
        reviewId,
        depositId: locked.deposit_id,
        expectedAmount: amount,
        actualBalance: balance,
        notes: `INSUFFICIENT_FUNDS_FOR_REFUND — MANUAL_REVIEW_REQUIRED (${reviewId}); provider_refund_id=${providerRefundId || 'none'}`,
      });
      return {
        success: false,
        refundId: reviewId,
        status: 'MANUAL_REVIEW_REQUIRED',
        code: 'MANUAL_REVIEW_REQUIRED',
        amount,
        amountPaise: toPaise(amount),
        providerRefundId: providerRefundId || null,
        walletBalance: balance,
        walletBalancePaise: toPaise(balance),
        message: 'Refund cannot auto-reverse wallet — insufficient funds. Queued for manual finance review.',
      };
    }

    const amountPaise = toPaise(amount);
    const balancePaise = toPaise(balance);
    const lockedPaise = toPaise(wallet.locked_deposit_balance);
    const lockedDebitPaise = Math.min(amountPaise, lockedPaise);
    const newBalance = fromPaise(balancePaise - amountPaise);
    const newLocked = fromPaise(lockedPaise - lockedDebitPaise);
    const txId = providerRefundId || `tx_refund_${refundId}`;
    const key = idempotencyKey || `refund:${providerRefundId || refundId}`;

    // Prefer promoting PROCESSING/PENDING intent row to PROCESSED (idempotent finalize).
    // Match by idempotency key OR provider_refund_id so API intent + webhook share one row.
    const promoted = await client.query(
      `UPDATE payment_refunds
       SET status = 'PROCESSED',
           provider_refund_id = COALESCE($2, provider_refund_id),
           transaction_id = $3,
           amount = $4,
           raw_payload = COALESCE($5, raw_payload),
           updated_at = NOW()
       WHERE UPPER(status) IN ('PROCESSING', 'PENDING')
         AND (
           idempotency_key = $1
           OR ($2::text IS NOT NULL AND provider_refund_id = $2)
         )
       RETURNING refund_id`,
      [
        key,
        providerRefundId || null,
        txId,
        amount,
        rawPayload ? JSON.stringify(rawPayload) : null,
      ],
    );

    let effectiveRefundId = promoted.rows[0]?.refund_id || refundId;

    if (!promoted.rows[0]) {
      const insertRes = await client.query(
        `INSERT INTO payment_refunds (
           refund_id, deposit_id, user_id, provider_payment_id, provider_refund_id,
           amount, currency, status, reason, actor_id, idempotency_key, transaction_id, raw_payload, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,'PROCESSED',$8,$9,$10,$11,$12,NOW())
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING refund_id`,
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
          key,
          txId,
          rawPayload ? JSON.stringify(rawPayload) : null,
        ],
      );

      if (insertRes.rows[0]) {
        effectiveRefundId = insertRes.rows[0].refund_id;
      } else {
        const conflict = await client.query(
          `SELECT refund_id, status, amount, transaction_id, provider_refund_id
           FROM payment_refunds WHERE idempotency_key = $1 LIMIT 1`,
          [key],
        );
        if (!conflict.rows[0]) {
          throw Object.assign(new Error('Failed to persist refund row'), {
            code: 'REFUND_PERSIST_FAILED',
            status: 500,
          });
        }
        const existingRow = conflict.rows[0];
        const existingStatus = String(existingRow.status || '').toUpperCase();
        if (existingStatus === 'PROCESSED') {
          return duplicateResult(existingRow);
        }
        if (existingStatus === 'MANUAL_REVIEW_REQUIRED') {
          return {
            success: false,
            duplicate: true,
            refundId: existingRow.refund_id,
            status: 'MANUAL_REVIEW_REQUIRED',
            code: 'MANUAL_REVIEW_REQUIRED',
            amount: money(existingRow.amount),
            amountPaise: toPaise(existingRow.amount),
            providerRefundId: existingRow.provider_refund_id,
            message: 'Refund already queued for manual finance review.',
          };
        }
        const promotedOther = await client.query(
          `UPDATE payment_refunds
           SET status = 'PROCESSED',
               provider_refund_id = COALESCE($2, provider_refund_id),
               transaction_id = $3,
               updated_at = NOW()
           WHERE refund_id = $1 AND UPPER(status) IN ('PROCESSING', 'PENDING')
           RETURNING refund_id`,
          [existingRow.refund_id, providerRefundId || null, txId],
        );
        if (!promotedOther.rows[0]) {
          throw Object.assign(new Error('Refund row conflict — retry'), {
            code: 'REFUND_IN_PROGRESS',
            status: 409,
          });
        }
        effectiveRefundId = existingRow.refund_id;
      }
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
        `Razorpay refund ${providerRefundId || effectiveRefundId} for deposit ${locked.deposit_id}`,
      ],
    );

    const newRefundedTotal = fromPaise(toPaise(already) + amountPaise);
    const newStatus = toPaise(newRefundedTotal) >= toPaise(locked.amount)
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
          amountPaise,
          providerRefundId,
          newBalance,
          status: newStatus,
        }),
        correlationId || null,
      ],
    );

    logger.info('refund_wallet_applied', {
      depositId: locked.deposit_id,
      userId: locked.user_id,
      refundId: effectiveRefundId,
      providerRefundId,
      amountInr: amount,
      amountPaise,
      newBalance,
      depositStatus: newStatus,
    });

    return {
      success: true,
      duplicate: false,
      refundId: effectiveRefundId,
      status: 'PROCESSED',
      amount,
      amountPaise,
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
  const amount = fromPaise(Number(refundEntity.amount || 0));
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

  return { ...result, status: result.duplicate ? 'IGNORED_DUPLICATE' : (result.success === false ? result.status : 'SUCCESS') };
}

export const razorpayRefundEngine = {
  requestDepositRefund,
  applyProcessedRefund,
  processRefundWebhookEntity,
};
