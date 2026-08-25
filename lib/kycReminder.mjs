/**
 * KYC reminder engine — admin-triggered completion emails via existing SMTP (Zoho/etc.).
 */

import crypto from 'crypto';
import { query } from '../db/pg.js';
import { logger } from './logger.mjs';

/** Canonical completed KYC status for OddsYra. */
export const KYC_COMPLETED_STATUS = 'VERIFIED';

/** Statuses that may receive a “complete your KYC” reminder. */
export const KYC_NEEDS_REMINDER_STATUSES = Object.freeze([
  'NOT_STARTED',
  'PENDING',
  'UNDER_REVIEW',
  'VERIFICATION_REQUIRED',
  'RESUBMISSION_REQUIRED',
  'REJECTED',
  'EXPIRED',
]);

const COOLDOWN_HOURS = Math.max(
  1,
  parseInt(process.env.KYC_REMINDER_COOLDOWN_HOURS || '24', 10) || 24,
);
const MAX_ATTEMPTS = Math.max(1, parseInt(process.env.KYC_REMINDER_MAX_ATTEMPTS || '5', 10) || 5);

async function getEmailService() {
  return import('../server/auth/emailService.js');
}

async function getAuditLogger() {
  return import('../server/middleware/auditLogger.js');
}

export function normalizeKycStatus(raw) {
  return String(raw || 'NOT_STARTED').trim().toUpperCase() || 'NOT_STARTED';
}

export function isKycCompleted(userOrStatus) {
  const status = typeof userOrStatus === 'string'
    ? normalizeKycStatus(userOrStatus)
    : normalizeKycStatus(userOrStatus?.kycStatus || userOrStatus?.kyc_status || userOrStatus?.kyc || userOrStatus?.status);
  return status === KYC_COMPLETED_STATUS || status === 'APPROVED';
}

export function needsKycReminder(userOrStatus) {
  if (isKycCompleted(userOrStatus)) return false;
  const status = typeof userOrStatus === 'string'
    ? normalizeKycStatus(userOrStatus)
    : normalizeKycStatus(userOrStatus?.kycStatus || userOrStatus?.kyc_status || userOrStatus?.kyc || userOrStatus?.status);
  return KYC_NEEDS_REMINDER_STATUSES.includes(status) || !isKycCompleted(status);
}

function reminderId() {
  return `kyc_rem_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

async function loadUserForReminder(userId) {
  const res = await query(
    `SELECT u.user_id,
            u.email,
            u.phone,
            COALESCE(u.first_name, '') AS first_name,
            COALESCE(
              NULLIF(TRIM(p.display_name), ''),
              NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''),
              split_part(u.email, '@', 1),
              u.user_id
            ) AS display_name,
            UPPER(COALESCE(p.kyc_status, 'NOT_STARTED')) AS kyc_status
     FROM users u
     LEFT JOIN user_profiles p ON p.user_id = u.user_id
     WHERE u.user_id = $1
     LIMIT 1`,
    [userId],
  );
  return res.rows[0] || null;
}

async function getReminderSummary(userId) {
  const res = await query(
    `SELECT
       COUNT(*) FILTER (WHERE delivery_status = 'SENT')::int AS sent_count,
       MAX(sent_at) FILTER (WHERE delivery_status = 'SENT') AS last_sent_at,
       (
         SELECT delivery_status
         FROM kyc_reminder_log
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 1
       ) AS last_delivery_status,
       (
         SELECT created_at
         FROM kyc_reminder_log
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 1
       ) AS last_reminder_at
     FROM kyc_reminder_log
     WHERE user_id = $1`,
    [userId],
  );
  const row = res.rows[0] || {};
  return {
    reminderCount: Number(row.sent_count || 0),
    lastSentAt: row.last_sent_at || null,
    lastDeliveryStatus: row.last_delivery_status || null,
    lastReminderAt: row.last_reminder_at || null,
  };
}

async function findByIdempotencyKey(key) {
  if (!key) return null;
  const res = await query(
    `SELECT * FROM kyc_reminder_log WHERE idempotency_key = $1 LIMIT 1`,
    [key],
  );
  return res.rows[0] || null;
}

async function inCooldown(userId) {
  const res = await query(
    `SELECT reminder_id, created_at, delivery_status
     FROM kyc_reminder_log
     WHERE user_id = $1
       AND delivery_status IN ('QUEUED', 'SENT')
       AND created_at > NOW() - ($2::text || ' hours')::interval
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, String(COOLDOWN_HOURS)],
  );
  return res.rows[0] || null;
}

function mapReminderRow(row) {
  if (!row) return null;
  return {
    reminderId: row.reminder_id,
    userId: row.user_id,
    email: row.email,
    kycStatusAtSend: row.kyc_status_at_send,
    deliveryStatus: row.delivery_status,
    provider: row.provider || null,
    messageId: row.message_id || null,
    attemptCount: Number(row.attempt_count || 0),
    createdAt: row.created_at,
    sentAt: row.sent_at || null,
    errorMessage: row.error_message || null,
  };
}

/**
 * Queue + attempt immediate send for one user (revalidates KYC on server).
 */
export async function sendKycReminderForUser({
  userId,
  adminId,
  idempotencyKey = null,
  bypassCooldown = false,
  deferDelivery = false,
} = {}) {
  const queued = await queueKycReminderForUser({
    userId,
    adminId,
    idempotencyKey,
    bypassCooldown,
  });
  if (queued.duplicate || deferDelivery) {
    return {
      ...queued,
      message: queued.duplicate
        ? queued.message
        : 'KYC reminder queued successfully.',
    };
  }

  const user = await loadUserForReminder(userId);
  const delivery = await deliverReminder(queued.notificationId, {
    email: queued.reminder?.email || user?.email,
    name: user?.display_name || user?.first_name || 'there',
  });

  return {
    success: delivery.deliveryStatus === 'SENT',
    status: delivery.deliveryStatus,
    notificationId: queued.notificationId,
    message: delivery.deliveryStatus === 'SENT'
      ? 'KYC reminder sent successfully.'
      : delivery.deliveryStatus === 'QUEUED'
        ? 'KYC reminder queued for retry.'
        : 'KYC reminder failed to send.',
    reminder: delivery,
  };
}

async function deliverReminder(reminderId, { email, name }) {
  await query(
    `UPDATE kyc_reminder_log
     SET attempt_count = attempt_count + 1, updated_at = NOW()
     WHERE reminder_id = $1`,
    [reminderId],
  );

  try {
    const { sendKycReminderEmail } = await getEmailService();
    const result = await sendKycReminderEmail({ email, name });
    if (result?.success) {
      const updated = await query(
        `UPDATE kyc_reminder_log
         SET delivery_status = 'SENT',
             provider = $2,
             message_id = $3,
             error_message = NULL,
             sent_at = NOW(),
             next_retry_at = NULL,
             updated_at = NOW()
         WHERE reminder_id = $1
         RETURNING *`,
        [reminderId, result.provider || 'smtp', result.messageId || null],
      );
      const { logAdminAction } = await getAuditLogger();
      await logAdminAction({
        actorId: updated.rows[0]?.admin_id || 'system',
        targetId: updated.rows[0]?.user_id,
        action: 'KYC_REMINDER_SENT',
        details: {
          reminderId,
          provider: result.provider || 'smtp',
          messageId: result.messageId || null,
        },
      });
      return mapReminderRow(updated.rows[0]);
    }

    const errMsg = result?.error || 'send_failed';
    const row = await markFailed(reminderId, errMsg);
    return mapReminderRow(row);
  } catch (err) {
    logger.warn('kyc_reminder_send_failed', { reminderId, error: err.message });
    const row = await markFailed(reminderId, err.message);
    return mapReminderRow(row);
  }
}

async function markFailed(reminderId, errorMessage) {
  const current = await query(
    `SELECT attempt_count FROM kyc_reminder_log WHERE reminder_id = $1`,
    [reminderId],
  );
  const attempts = Number(current.rows[0]?.attempt_count || 1);
  const canRetry = attempts < MAX_ATTEMPTS;
  const backoffMin = Math.min(60, 2 ** Math.min(attempts, 5));
  const res = await query(
    `UPDATE kyc_reminder_log
     SET delivery_status = $2,
         error_message = $3,
         next_retry_at = CASE WHEN $4 THEN NOW() + ($5::text || ' minutes')::interval ELSE NULL END,
         updated_at = NOW()
     WHERE reminder_id = $1
     RETURNING *`,
    [
      reminderId,
      canRetry ? 'QUEUED' : 'FAILED',
      String(errorMessage || 'send_failed').slice(0, 500),
      canRetry,
      String(backoffMin),
    ],
  );
  return res.rows[0];
}

/**
 * Queue a reminder without waiting on Zoho (used by bulk).
 */
export async function queueKycReminderForUser({
  userId,
  adminId,
  idempotencyKey = null,
  bypassCooldown = false,
} = {}) {
  if (!userId) {
    const err = new Error('User id is required.');
    err.code = 'USER_REQUIRED';
    err.status = 400;
    throw err;
  }

  if (idempotencyKey) {
    const existing = await findByIdempotencyKey(idempotencyKey);
    if (existing) {
      return {
        success: true,
        status: existing.delivery_status,
        notificationId: existing.reminder_id,
        message: 'Idempotent replay — reminder already recorded.',
        duplicate: true,
        reminder: mapReminderRow(existing),
      };
    }
  }

  const user = await loadUserForReminder(userId);
  if (!user) {
    const err = new Error('User not found.');
    err.code = 'USER_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  const kycStatus = normalizeKycStatus(user.kyc_status);
  if (isKycCompleted(kycStatus)) {
    const err = new Error('This user has already completed KYC.');
    err.code = 'KYC_ALREADY_COMPLETED';
    err.status = 400;
    throw err;
  }

  const email = String(user.email || '').trim();
  if (!email || !email.includes('@')) {
    const err = new Error('User has no valid email address.');
    err.code = 'EMAIL_MISSING';
    err.status = 400;
    throw err;
  }

  if (!bypassCooldown) {
    const recent = await inCooldown(userId);
    if (recent) {
      const err = new Error(
        `A KYC reminder was sent recently. Try again after the ${COOLDOWN_HOURS}h cooldown.`,
      );
      err.code = 'KYC_REMINDER_COOLDOWN';
      err.status = 429;
      err.cooldownUntil = recent.created_at;
      throw err;
    }
  }

  const id = reminderId();
  await query(
    `INSERT INTO kyc_reminder_log (
       reminder_id, user_id, admin_id, email, kyc_status_at_send,
       delivery_status, attempt_count, idempotency_key, next_retry_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, 'QUEUED', 0, $6, NOW(), NOW())`,
    [id, userId, adminId || null, email, kycStatus, idempotencyKey || null],
  );

  const { logAdminAction } = await getAuditLogger();
  await logAdminAction({
    actorId: adminId || 'admin',
    targetId: userId,
    action: 'KYC_REMINDER_QUEUED',
    details: {
      reminderId: id,
      email,
      kycStatus,
      idempotencyKey: idempotencyKey || null,
      deferred: true,
    },
  });

  return {
    success: true,
    status: 'QUEUED',
    notificationId: id,
    message: 'KYC reminder queued successfully.',
    reminder: { reminderId: id, userId, email, kycStatusAtSend: kycStatus, deliveryStatus: 'QUEUED' },
  };
}

/**
 * Bulk reminders — revalidates each user; queues jobs for the worker (no sync Zoho blast).
 * Never fails the entire batch because one user is invalid.
 */
export async function sendKycRemindersBulk({
  userIds = [],
  adminId,
  idempotencyKeyPrefix = null,
  bypassCooldown = false,
} = {}) {
  const ids = [...new Set((userIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  const results = [];
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const userId of ids) {
    const key = idempotencyKeyPrefix ? `${idempotencyKeyPrefix}:${userId}` : null;
    try {
      const out = await queueKycReminderForUser({
        userId,
        adminId,
        idempotencyKey: key,
        bypassCooldown,
      });
      sent += 1;
      results.push({
        userId,
        status: out.duplicate ? 'IDEMPOTENT' : 'QUEUED',
        notificationId: out.notificationId,
      });
    } catch (err) {
      if (err.code === 'KYC_ALREADY_COMPLETED') {
        skipped += 1;
        results.push({ userId, status: 'SKIPPED_KYC_COMPLETED' });
      } else if (err.code === 'KYC_REMINDER_COOLDOWN') {
        skipped += 1;
        results.push({ userId, status: 'SKIPPED_COOLDOWN' });
      } else if (err.code === 'EMAIL_MISSING') {
        skipped += 1;
        results.push({ userId, status: 'SKIPPED_EMAIL_MISSING' });
      } else if (err.code === 'USER_NOT_FOUND') {
        skipped += 1;
        results.push({ userId, status: 'SKIPPED_NOT_FOUND' });
      } else {
        failed += 1;
        results.push({ userId, status: 'FAILED', error: err.message });
      }
    }
  }

  const { logAdminAction } = await getAuditLogger();
  await logAdminAction({
    actorId: adminId || 'admin',
    targetId: null,
    action: 'KYC_REMINDER_BULK',
    details: { requested: ids.length, queued: sent, skipped, failed },
  });

  // Kick worker without blocking the HTTP response on Zoho
  setImmediate(() => {
    processKycReminderRetries({ limit: Math.min(ids.length, 50) }).catch(() => null);
  });

  return { sent, skipped, failed, results };
}

/** Worker: retry queued/failed reminders that are due. */
export async function processKycReminderRetries({ limit = 20 } = {}) {
  const res = await query(
    `SELECT reminder_id, email, user_id
     FROM kyc_reminder_log
     WHERE delivery_status = 'QUEUED'
       AND attempt_count < $1
       AND (next_retry_at IS NULL OR next_retry_at <= NOW())
     ORDER BY created_at ASC
     LIMIT $2`,
    [MAX_ATTEMPTS, Math.min(Math.max(Number(limit) || 20, 1), 100)],
  );

  let sent = 0;
  let failed = 0;
  for (const row of res.rows || []) {
    const user = await loadUserForReminder(row.user_id);
    if (user && isKycCompleted(user.kyc_status)) {
      await query(
        `UPDATE kyc_reminder_log
         SET delivery_status = 'SKIPPED', error_message = 'KYC completed before send', updated_at = NOW()
         WHERE reminder_id = $1`,
        [row.reminder_id],
      );
      skippedSafe();
      continue;
    }
    const name = user?.display_name || 'there';
    const delivery = await deliverReminder(row.reminder_id, { email: row.email, name });
    if (delivery?.deliveryStatus === 'SENT') sent += 1;
    else if (delivery?.deliveryStatus === 'FAILED') failed += 1;
  }
  return { checked: (res.rows || []).length, sent, failed };
}

function skippedSafe() {
  // no-op helper for clarity
}

export async function getUserKycReminderMeta(userId) {
  return getReminderSummary(userId);
}

export { COOLDOWN_HOURS as KYC_REMINDER_COOLDOWN_HOURS };
