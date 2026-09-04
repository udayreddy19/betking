/**
 * Payments ops notifications — deposits/withdrawals → payments@ (with digest + escalation).
 */
import { randomUUID } from 'crypto';
import { query, withTransaction } from '../db/pg.js';
import { logger } from './logger.mjs';

const FRONTEND_URL = process.env.FRONTEND_URL || process.env.APP_URL || 'https://oddsyra.com';

function numEnv(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function paymentsOpsConfig() {
  return {
    recipient: String(process.env.PAYMENTS_ALERT_EMAIL || 'payments@oddsyra.com').trim(),
    highDepositInr: numEnv('PAYMENTS_DEPOSIT_HIGH_INR', 10000),
    /** Deposits strictly below this INR are buffered into an hourly digest. 0 = always instant. */
    digestBelowInr: numEnv('PAYMENTS_DEPOSIT_DIGEST_BELOW_INR', 500),
    digestIntervalMs: Math.max(60_000, numEnv('PAYMENTS_DEPOSIT_DIGEST_INTERVAL_MS', 3_600_000)),
    escalateTo: String(
      process.env.PAYMENTS_ESCALATE_CC
      || process.env.SUPPORT_ALERT_EMAIL
      || process.env.ALERTS_EMAIL
      || 'alerts@oddsyra.com',
    ).trim(),
  };
}

function formatInr(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return String(amount ?? '');
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function adminFinanceHref(subModule = 'deposits-review') {
  return `${FRONTEND_URL}/admin?domain=finance&subModule=${encodeURIComponent(subModule)}`;
}

async function writeEmailLog({ kind, status, recipient, subject, meta = {}, errorMessage = null }) {
  const id = `poe_${Date.now()}_${randomUUID().slice(0, 8)}`;
  try {
    await query(
      `INSERT INTO payments_ops_email_log (id, kind, status, recipient, subject, meta, error_message, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, NOW())
       ON CONFLICT (id) DO NOTHING`,
      [id, kind, status, recipient || null, subject || null, JSON.stringify(meta || {}), errorMessage],
    );
  } catch (err) {
    logger.warn('payments_ops_email_log_write_failed', { error: err.message, kind, status });
  }
  return id;
}

async function lookupContact(userId) {
  if (!userId) return { email: null, name: null };
  try {
    const res = await query(
      `SELECT email, first_name, last_name FROM users WHERE user_id = $1 LIMIT 1`,
      [userId],
    );
    const row = res.rows[0];
    if (!row) return { email: null, name: null };
    const name = [row.first_name, row.last_name].filter(Boolean).join(' ') || null;
    return { email: row.email || null, name };
  } catch {
    return { email: null, name: null };
  }
}

/**
 * Route a newly captured deposit: high → instant+CC, mid → instant, small → digest.
 */
export async function notifyOpsDepositCaptured(payload = {}) {
  const cfg = paymentsOpsConfig();
  const amount = Number(payload.amount);
  const contact = await lookupContact(payload.userId);
  const enriched = {
    ...payload,
    userName: contact.name,
    userEmail: contact.email,
    amountLabel: formatInr(amount),
    adminHref: adminFinanceHref('deposits-review'),
  };

  const isHigh = Number.isFinite(amount) && amount >= cfg.highDepositInr;
  const useDigest = !isHigh
    && cfg.digestBelowInr > 0
    && Number.isFinite(amount)
    && amount < cfg.digestBelowInr;

  if (useDigest) {
    try {
      await query(
        `INSERT INTO payments_ops_digest_items (kind, user_id, amount, payload, created_at)
         VALUES ('deposit', $1, $2, $3::jsonb, NOW())`,
        [payload.userId || null, amount, JSON.stringify(enriched)],
      );
      await writeEmailLog({
        kind: 'deposit_digest_queued',
        status: 'QUEUED',
        recipient: cfg.recipient,
        subject: `Digest pending: ${enriched.amountLabel}`,
        meta: { paymentId: payload.paymentId, depositId: payload.depositId, amount },
      });
      logger.info('payments_ops_deposit_digest_queued', {
        userId: payload.userId,
        amount,
        paymentId: payload.paymentId,
      });
      return { success: true, mode: 'digest_queued' };
    } catch (err) {
      logger.error('payments_ops_digest_queue_failed', {
        error: err.message,
        userId: payload.userId,
        amount,
      });
      // Fall through to instant mail so ops still sees the deposit
    }
  }

  return sendInstantDepositOpsEmail(enriched, { escalate: isHigh });
}

async function sendInstantDepositOpsEmail(payload, { escalate = false } = {}) {
  const cfg = paymentsOpsConfig();
  const emailMod = await import('../server/auth/emailService.js');
  const subjectPrefix = escalate ? '[HIGH] ' : '';
  try {
    const result = await emailMod.sendDepositOpsNotificationEmail({
      ...payload,
      subjectPrefix,
      cc: escalate && cfg.escalateTo && cfg.escalateTo.toLowerCase() !== cfg.recipient.toLowerCase()
        ? cfg.escalateTo
        : null,
      adminHref: payload.adminHref || adminFinanceHref('deposits-review'),
    });
    const ok = result?.success !== false && !result?.error;
    await writeEmailLog({
      kind: escalate ? 'deposit_high' : 'deposit_instant',
      status: ok ? 'SENT' : 'FAILED',
      recipient: cfg.recipient,
      subject: result?.subject || null,
      meta: {
        paymentId: payload.paymentId,
        depositId: payload.depositId,
        amount: payload.amount,
        escalate,
        messageId: result?.messageId || null,
      },
      errorMessage: ok ? null : (result?.error || 'send_failed'),
    });
    if (!ok) {
      logger.error('payments_ops_email_failed', {
        kind: 'deposit',
        error: result?.error || 'send_failed',
        paymentId: payload.paymentId,
        amount: payload.amount,
      });
    }
    return { ...result, mode: escalate ? 'instant_high' : 'instant', success: ok };
  } catch (err) {
    await writeEmailLog({
      kind: escalate ? 'deposit_high' : 'deposit_instant',
      status: 'FAILED',
      recipient: cfg.recipient,
      subject: null,
      meta: { paymentId: payload.paymentId, depositId: payload.depositId, amount: payload.amount },
      errorMessage: err.message,
    });
    logger.error('payments_ops_email_failed', {
      kind: 'deposit',
      error: err.message,
      paymentId: payload.paymentId,
      amount: payload.amount,
    });
    return { success: false, error: err.message, mode: escalate ? 'instant_high' : 'instant' };
  }
}

/**
 * Withdrawal ops alert — paid (APPROVED + UTR), rejected/failed, or hold needing attention.
 */
export async function notifyOpsWithdrawalEvent(payload = {}) {
  const cfg = paymentsOpsConfig();
  const contact = await lookupContact(payload.userId);
  const status = String(payload.status || '').toUpperCase();
  const emailMod = await import('../server/auth/emailService.js');
  const adminHref = adminFinanceHref(
    status === 'HOLD' || status === 'PENDING_CHECKER' ? 'maker-checker' : 'pending-approvals',
  );

  try {
    const result = await emailMod.sendWithdrawalOpsNotificationEmail({
      userId: payload.userId,
      userName: contact.name,
      userEmail: contact.email,
      amount: payload.amount,
      status,
      withdrawalId: payload.withdrawalId,
      utr: payload.utr || payload.payoutRef || null,
      reason: payload.reason || null,
      adminHref,
    });
    const ok = result?.success !== false && !result?.error;
    await writeEmailLog({
      kind: `withdrawal_${status.toLowerCase() || 'event'}`,
      status: ok ? 'SENT' : 'FAILED',
      recipient: cfg.recipient,
      subject: result?.subject || null,
      meta: {
        withdrawalId: payload.withdrawalId,
        amount: payload.amount,
        utr: payload.utr || payload.payoutRef || null,
        messageId: result?.messageId || null,
      },
      errorMessage: ok ? null : (result?.error || 'send_failed'),
    });
    if (!ok) {
      logger.error('payments_ops_email_failed', {
        kind: 'withdrawal',
        status,
        error: result?.error || 'send_failed',
        withdrawalId: payload.withdrawalId,
      });
    }
    return { ...result, success: ok };
  } catch (err) {
    await writeEmailLog({
      kind: `withdrawal_${status.toLowerCase() || 'event'}`,
      status: 'FAILED',
      recipient: cfg.recipient,
      subject: null,
      meta: { withdrawalId: payload.withdrawalId, amount: payload.amount },
      errorMessage: err.message,
    });
    logger.error('payments_ops_email_failed', {
      kind: 'withdrawal',
      status,
      error: err.message,
      withdrawalId: payload.withdrawalId,
    });
    return { success: false, error: err.message };
  }
}

/**
 * Flush pending small-deposit digest items into one ops email.
 * Claims rows first (flushed_at set) so concurrent workers cannot double-send;
 * rolls claim back if SMTP fails.
 */
export async function flushPaymentsDepositDigest({ limit = 200 } = {}) {
  const cfg = paymentsOpsConfig();
  const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 500);

  let rows = [];
  try {
    rows = await withTransaction(async (client) => {
      const claimed = await client.query(
        `UPDATE payments_ops_digest_items
         SET flushed_at = NOW()
         WHERE id IN (
           SELECT id FROM payments_ops_digest_items
           WHERE flushed_at IS NULL AND kind = 'deposit'
           ORDER BY created_at ASC
           LIMIT $1
           FOR UPDATE SKIP LOCKED
         )
         RETURNING id, user_id, amount, payload, created_at`,
        [safeLimit],
      );
      return claimed.rows || [];
    });
  } catch (err) {
    if (/relation .*payments_ops_digest/i.test(err.message)) {
      logger.warn('payments_ops_digest_table_missing', { error: err.message });
      return { flushed: 0, emailed: false, error: err.message };
    }
    return { flushed: 0, emailed: false, error: err.message };
  }

  if (rows.length === 0) {
    return { flushed: 0, emailed: false };
  }

  const ids = rows.map((r) => r.id);
  const total = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const emailMod = await import('../server/auth/emailService.js');

  const unclaim = async (errorMessage) => {
    await query(
      `UPDATE payments_ops_digest_items SET flushed_at = NULL WHERE id = ANY($1::bigint[])`,
      [ids],
    ).catch(() => {});
    await writeEmailLog({
      kind: 'deposit_digest',
      status: 'FAILED',
      recipient: cfg.recipient,
      subject: null,
      meta: { count: rows.length, total, ids },
      errorMessage,
    });
    logger.error('payments_ops_email_failed', {
      kind: 'deposit_digest',
      error: errorMessage,
      count: rows.length,
    });
  };

  let sendResult;
  try {
    sendResult = await emailMod.sendDepositOpsDigestEmail({
      items: rows.map((r) => {
        const p = typeof r.payload === 'string' ? JSON.parse(r.payload) : (r.payload || {});
        return {
          userId: r.user_id,
          userName: p.userName,
          userEmail: p.userEmail,
          amount: Number(r.amount),
          amountLabel: formatInr(r.amount),
          paymentId: p.paymentId,
          provider: p.provider,
          createdAt: r.created_at,
        };
      }),
      count: rows.length,
      totalAmount: total,
      totalLabel: formatInr(total),
      adminHref: adminFinanceHref('deposits-review'),
    });
  } catch (err) {
    await unclaim(err.message);
    return { flushed: 0, emailed: false, error: err.message };
  }

  const ok = sendResult?.success !== false && !sendResult?.error;
  if (!ok) {
    await unclaim(sendResult?.error || 'send_failed');
    return { flushed: 0, emailed: false, error: sendResult?.error || 'send_failed' };
  }

  await writeEmailLog({
    kind: 'deposit_digest',
    status: 'SENT',
    recipient: cfg.recipient,
    subject: sendResult?.subject || null,
    meta: { count: rows.length, total, ids, messageId: sendResult?.messageId || null },
  });
  logger.info('payments_ops_deposit_digest_flushed', { count: rows.length, total });
  return { flushed: rows.length, emailed: true, total };
}

/** One-shot mailbox / SMTP smoke test to payments@. */
export async function sendPaymentsOpsTestEmail({ note = null } = {}) {
  const cfg = paymentsOpsConfig();
  const emailMod = await import('../server/auth/emailService.js');
  const subject = `[TEST] OddsYra payments inbox check — ${new Date().toISOString()}`;
  try {
    const result = await emailMod.sendDepositOpsNotificationEmail({
      userId: 'usr_test_ops',
      userName: 'Ops Test User',
      userEmail: 'ops-test@oddsyra.com',
      amount: 1,
      paymentId: `pay_test_${Date.now()}`,
      provider: 'TEST',
      depositId: `dep_test_${Date.now()}`,
      method: 'upi',
      utr: 'TESTUTR0001',
      subjectPrefix: '[TEST] ',
      adminHref: adminFinanceHref('deposits-review'),
      testNote: note || 'Manual smoke test — ignore amount; confirms payments@ delivery.',
    });
    const ok = result?.success !== false && !result?.error;
    await writeEmailLog({
      kind: 'deposit_test',
      status: ok ? 'SENT' : 'FAILED',
      recipient: cfg.recipient,
      subject,
      meta: { messageId: result?.messageId || null },
      errorMessage: ok ? null : (result?.error || 'send_failed'),
    });
    return { ...result, success: ok, recipient: cfg.recipient, subject };
  } catch (err) {
    await writeEmailLog({
      kind: 'deposit_test',
      status: 'FAILED',
      recipient: cfg.recipient,
      subject,
      errorMessage: err.message,
    });
    return { success: false, error: err.message, recipient: cfg.recipient, subject };
  }
}
