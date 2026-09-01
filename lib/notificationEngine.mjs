import { query, withTransaction } from '../db/pg.js';
import { idempotencyEngine } from './idempotencyEngine.mjs';

/**
 * Enterprise Unified Notification & Communication Engine
 */

/**
 * Safely Render Template Variables
 */
export function renderNotificationTemplate(templateBody = '', variables = {}) {
  let rendered = String(templateBody);
  for (const [key, val] of Object.entries(variables)) {
    const placeholder = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    rendered = rendered.replace(placeholder, String(val ?? ''));
  }
  return rendered;
}

/**
 * Dispatch Event-Driven Notification with Idempotency & Preferences
 */
export async function dispatchNotificationEvent({
  eventId,
  eventType,
  userId,
  category = 'TRANSACTIONAL',
  channel = 'IN_APP',
  recipient = '',
  data = {},
}) {
  // 1. Mandatory Idempotency Check
  const eKey = `notif_${eventType}_${eventId}_${userId}`;
  const idCheck = await idempotencyEngine.checkOrLock(eKey, 'notification_dispatch', `${eventId}_${userId}`);
  if (idCheck.isDuplicate) {
    if (idCheck.status === 'COMPLETED') return idCheck.result;
  }

  // 1.5 Mandatory SMS Disablement
  if (channel === 'SMS') {
    return { skipped: true, reason: 'SMS_DISABLED_BY_POLICY' };
  }

  // 1.6 Payment and Betting Email Disablement (In-App & Browser Push remain active)
  const DISABLED_EMAIL_CATEGORIES = [
    'PAYMENT', 'PAYMENTS', 'WALLET', 'DEPOSIT', 'WITHDRAWAL',
    'BETTING', 'BET', 'SETTLEMENT', 'CASHOUT'
  ];
  if (channel === 'EMAIL' && DISABLED_EMAIL_CATEGORIES.includes(String(category).toUpperCase())) {
    return { skipped: true, reason: 'PAYMENT_AND_BETTING_EMAILS_DISABLED_BY_POLICY' };
  }

  try {
    // 2. Evaluate User Preferences (Marketing Opt-Outs)
    if (category === 'PROMOTIONAL' || category === 'PROMOTION') {
      const prefRes = await query(`
        SELECT marketing_email, marketing_sms, marketing_push
        FROM user_notification_preferences
        WHERE user_id = $1;
      `, [userId]);

      if (prefRes.rows.length > 0) {
        const p = prefRes.rows[0];
        if (channel === 'EMAIL' && !p.marketing_email) return { skipped: true, reason: 'OPTED_OUT_EMAIL' };
        if (channel === 'PUSH' && !p.marketing_push) return { skipped: true, reason: 'OPTED_OUT_PUSH' };
      }
    }

    // 3. Resolve Template
    const templateRes = await query(`
      SELECT subject, body_template
      FROM notification_templates
      WHERE event_type = $1 AND channel = $2 AND status = 'ACTIVE'
      ORDER BY version DESC LIMIT 1;
    `, [eventType, channel]);

    let subject = `Notification: ${eventType}`;
    let body = JSON.stringify(data);

    if (templateRes.rows.length > 0) {
      subject = renderNotificationTemplate(templateRes.rows[0].subject || subject, data);
      body = renderNotificationTemplate(templateRes.rows[0].body_template, data);
    } else if (data.message) {
      body = String(data.message);
    }
    if (data.subject) subject = String(data.subject);
    if (data.body) body = String(data.body);

    // 4. Queue Notification in PostgreSQL
    const notificationId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    await query(`
      INSERT INTO notifications (id, user_id, event_type, category, channel, recipient, subject, body, status, event_id, attempts)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'QUEUED', $9, 0);
    `, [notificationId, userId, eventType, category, channel, recipient || userId, subject, body, eventId]);

    const result = {
      success: true,
      notificationId,
      eventId,
      eventType,
      channel,
      status: 'QUEUED',
    };

    await idempotencyEngine.complete(eKey, result);
    return result;
  } catch (err) {
    await idempotencyEngine.fail(eKey, err.message);
    throw err;
  }
}

/**
 * Worker Delivery Queue Processor (State Machine & Dead Letter Queue)
 */
export async function processNotificationDeliveryQueue() {
  const pendingRes = await query(`
    SELECT id, user_id, event_type, channel, recipient, subject, body, attempts
    FROM notifications
    WHERE status IN ('QUEUED', 'RETRYING') AND attempts < 3
    ORDER BY created_at ASC
    LIMIT 50;
  `);

  let countDelivered = 0;
  let countDeadLetter = 0;

  for (const item of pendingRes.rows) {
    try {
      const { dispatchNotificationChannel } = await import('./notificationChannels.mjs');
      const result = await dispatchNotificationChannel(item.channel, item.recipient, item.body, item.subject);
      const delivered = Boolean(result?.delivered);

      if (delivered) {
        await query(`
          UPDATE notifications
          SET status = 'DELIVERED', delivered_at = CURRENT_TIMESTAMP, attempts = attempts + 1
          WHERE id = $1;
        `, [item.id]);
        countDelivered++;
      } else if (result?.skipped) {
        // Honest non-delivery (e.g. SMTP not configured) — do not claim DELIVERED
        await query(`
          UPDATE notifications
          SET status = 'FAILED', attempts = attempts + 1, error_message = $1
          WHERE id = $2;
        `, [String(result.reason || 'CHANNEL_SKIPPED').slice(0, 500), item.id]);
      }
    } catch (err) {
      const nextAttempts = item.attempts + 1;
      const newStatus = nextAttempts >= 3 ? 'DEAD_LETTER' : 'RETRYING';
      if (newStatus === 'DEAD_LETTER') countDeadLetter++;

      await query(`
        UPDATE notifications
        SET status = $1, attempts = $2, error_message = $3
        WHERE id = $4;
      `, [newStatus, nextAttempts, err.message, item.id]);
    }
  }

  return { success: true, countDelivered, countDeadLetter };
}
