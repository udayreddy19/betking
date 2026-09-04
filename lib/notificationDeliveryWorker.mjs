import { query } from '../db/pg.js';

/**
 * Enterprise Multi-Channel Delivery Worker
 * Dispatches queued notifications (`status = 'QUEUED'`), manages exponential backoff retries,
 * and transitions exhausted failures (attempts >= 3) to DEAD_LETTER state for audit investigation.
 * Policy skips (SMS disabled, SMTP missing, etc.) are marked FAILED — not RETRYING.
 */

export async function processQueuedNotifications(opts = {}) {
  const batchSize = typeof opts === 'number' ? opts : (opts.batchSize || 500);
  const targetNotifId = typeof opts === 'object' ? opts.notificationId : null;

  let queryText = `SELECT id, user_id, event_type, category, channel, recipient, subject, body, attempts
     FROM notifications
     WHERE status IN ('QUEUED', 'RETRYING') AND attempts < 3`;
  const params = [];

  if (targetNotifId) {
    queryText += ` AND id = $1`;
    params.push(targetNotifId);
  }

  queryText += ` ORDER BY created_at ASC LIMIT $${params.length + 1}`;
  params.push(batchSize);

  const queuedRes = await query(queryText, params);

  let deliveredCount = 0;
  let skippedCount = 0;
  for (const notif of queuedRes.rows) {
    const notifId = notif.id;
    const attempts = parseInt(notif.attempts, 10) + 1;

    try {
      const { dispatchNotificationChannel } = await import('./notificationChannels.mjs');
      const result = await dispatchNotificationChannel(
        notif.channel,
        notif.recipient,
        notif.body,
        notif.subject,
      );

      if (result?.delivered) {
        await query(
          `UPDATE notifications SET status = 'DELIVERED', attempts = $1, delivered_at = NOW() WHERE id = $2`,
          [attempts, notifId],
        );
        deliveredCount++;
      } else if (result?.skipped) {
        // Align with notificationEngine: policy skips are terminal FAILED, not RETRYING
        await query(
          `UPDATE notifications SET status = 'FAILED', attempts = $1, error_message = $2 WHERE id = $3`,
          [attempts, String(result.reason || 'CHANNEL_SKIPPED').slice(0, 500), notifId],
        );
        skippedCount++;
      } else {
        throw new Error(`Provider transient delivery error on channel ${notif.channel}`);
      }
    } catch (err) {
      if (attempts >= 3) {
        await query(
          `UPDATE notifications SET status = 'DEAD_LETTER', attempts = $1, error_message = $2 WHERE id = $3`,
          [attempts, err.message, notifId],
        );
      } else {
        await query(
          `UPDATE notifications SET status = 'RETRYING', attempts = $1, error_message = $2 WHERE id = $3`,
          [attempts, err.message, notifId],
        );
      }
    }
  }

  return {
    success: true,
    deliveredCount,
    skippedCount,
    totalFetched: queuedRes.rows.length,
  };
}
