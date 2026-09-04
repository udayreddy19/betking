/**
 * Payment refund reconciliation — detect provider ↔ internal mismatches.
 * Never auto-repairs; returns MATCHED / WARNING / MISMATCH / CRITICAL cases.
 */

import { query } from '../db/pg.js';
import { toPaise, fromPaise, roundInr } from './money.mjs';

function money(n) {
  return roundInr(n || 0);
}

/**
 * Reconcile refunds for a deposit (or recent window).
 */
export async function reconcileDepositRefunds({ depositId = null, limit = 50 } = {}) {
  const params = [];
  let where = '';
  if (depositId) {
    params.push(depositId);
    where = `WHERE d.deposit_id = $${params.length}`;
  }
  params.push(Math.min(Math.max(Number(limit) || 50, 1), 200));

  const deposits = await query(
    `SELECT d.deposit_id, d.payment_id, d.amount, d.status,
            COALESCE(d.refunded_amount, 0) AS refunded_amount
     FROM deposits d
     ${where}
     ORDER BY d.updated_at DESC NULLS LAST, d.created_at DESC
     LIMIT $${params.length}`,
    params,
  );

  const findings = [];

  for (const d of deposits.rows) {
    const refunds = await query(
      `SELECT refund_id, provider_refund_id, amount, status, transaction_id, created_at
       FROM payment_refunds WHERE deposit_id = $1 ORDER BY created_at ASC`,
      [d.deposit_id],
    );

    const processed = refunds.rows.filter((r) => r.status === 'PROCESSED');
    const manual = refunds.rows.filter((r) => r.status === 'MANUAL_REVIEW_REQUIRED');
    const processingOrphan = refunds.rows.filter(
      (r) => String(r.status).toUpperCase() === 'PROCESSING' && r.provider_refund_id,
    );
    const sumProcessedPaise = processed.reduce((s, r) => s + toPaise(r.amount), 0);
    const sumProcessed = fromPaise(sumProcessedPaise);
    const storedRefunded = money(d.refunded_amount);
    const depositAmt = money(d.amount);

    let flag = 'MATCHED';
    const reasons = [];

    if (sumProcessedPaise !== toPaise(storedRefunded)) {
      flag = 'MISMATCH';
      reasons.push(`refunded_amount ${storedRefunded} != sum(PROCESSED) ${sumProcessed}`);
    }
    if (sumProcessedPaise > toPaise(depositAmt)) {
      flag = 'CRITICAL';
      reasons.push('processed refunds exceed deposit amount');
    }
    if (processingOrphan.length > 0) {
      flag = flag === 'MATCHED' ? 'WARNING' : flag;
      reasons.push(
        `${processingOrphan.length} PROCESSING with provider_refund_id (wallet apply may be incomplete)`,
      );
    }
    for (const r of processed) {
      if (!r.provider_refund_id) {
        flag = flag === 'MATCHED' ? 'WARNING' : flag;
        reasons.push(`internal refund ${r.refund_id} missing provider_refund_id`);
      }
      if (!r.transaction_id) {
        flag = flag === 'MATCHED' ? 'WARNING' : flag;
        reasons.push(`internal refund ${r.refund_id} missing transaction_id`);
      } else {
        const tx = await query(
          `SELECT transaction_id FROM transactions WHERE transaction_id = $1`,
          [r.transaction_id],
        );
        if (!tx.rows[0]) {
          flag = 'MISMATCH';
          reasons.push(`ledger/tx missing for ${r.transaction_id}`);
        }
      }
    }
    if (manual.length > 0) {
      flag = flag === 'MATCHED' ? 'WARNING' : flag;
      reasons.push(`${manual.length} MANUAL_REVIEW_REQUIRED`);
    }

    findings.push({
      depositId: d.deposit_id,
      paymentId: d.payment_id,
      depositAmount: depositAmt,
      depositStatus: d.status,
      refundedAmount: storedRefunded,
      processedRefundSum: sumProcessed,
      refundCount: refunds.rows.length,
      manualReviewCount: manual.length,
      flag,
      reasons,
      refunds: refunds.rows.map((r) => ({
        refundId: r.refund_id,
        providerRefundId: r.provider_refund_id,
        amount: money(r.amount),
        status: r.status,
        transactionId: r.transaction_id,
      })),
    });
  }

  const summary = {
    matched: findings.filter((f) => f.flag === 'MATCHED').length,
    warning: findings.filter((f) => f.flag === 'WARNING').length,
    mismatch: findings.filter((f) => f.flag === 'MISMATCH').length,
    critical: findings.filter((f) => f.flag === 'CRITICAL').length,
  };

  return {
    success: true,
    timestamp: new Date().toISOString(),
    summary,
    findings,
  };
}

/**
 * List open MANUAL_REVIEW_REQUIRED refunds for finance ops.
 */
export async function listRefundManualReviews({ limit = 50 } = {}) {
  const res = await query(
    `SELECT refund_id, deposit_id, user_id, provider_payment_id, provider_refund_id,
            amount, status, reason, review_notes, actor_id, raw_payload, created_at
     FROM payment_refunds
     WHERE status = 'MANUAL_REVIEW_REQUIRED'
     ORDER BY created_at ASC
     LIMIT $1`,
    [Math.min(Math.max(Number(limit) || 50, 1), 200)],
  );
  return {
    reviews: res.rows.map((r) => ({
      ...r,
      amountPaise: toPaise(r.amount),
      orphanRisk: Boolean(r.provider_refund_id),
    })),
    count: res.rows.length,
  };
}
