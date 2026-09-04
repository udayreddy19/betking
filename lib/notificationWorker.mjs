import { query } from '../db/pg.js';
import { notificationTemplateEngine } from './notificationTemplateEngine.mjs';
import { getUserPreferences, isChannelAllowedForUser, isQuietHoursActive } from './notificationPreferencesEngine.mjs';
import { broadcastWsMessage } from './websocketEngine.mjs';

/**
 * Server-Authoritative Outbox Notification Worker
 * Asynchronously processes pending outbox events (`outbox_events`), enforces idempotency,
 * renders templates, checks preferences & quiet hours, and dispatches real-time WebSocket alerts to Admin Header bell.
 */

export async function ensureAdminNotificationTable() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS admin_notifications (
        notification_id VARCHAR(64) PRIMARY KEY,
        admin_id VARCHAR(64) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT,
        category VARCHAR(64) DEFAULT 'INFO',
        priority VARCHAR(16) DEFAULT 'NORMAL',
        action_type VARCHAR(64),
        action_target_type VARCHAR(64),
        action_target_id VARCHAR(128),
        action_label VARCHAR(64),
        is_read BOOLEAN DEFAULT FALSE,
        is_actioned BOOLEAN DEFAULT FALSE,
        tenant_id VARCHAR(64) DEFAULT 'oddsyra_in',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch (ignored) {}
}

export async function processPendingOutboxEvents(opts = {}) {
  // Dual-outbox hard guard: production must use lib/outboxWorker.mjs only.
  // This legacy worker must never process (or invent users) if accidentally invoked.
  if (process.env.NODE_ENV === 'production') {
    console.error(
      '[notificationWorker] Refusing to process outbox in production — use lib/outboxWorker.mjs',
    );
    return {
      success: false,
      refused: true,
      reason: 'PRODUCTION_USE_OUTBOX_WORKER',
      processedCount: 0,
      totalFetched: 0,
    };
  }

  await ensureAdminNotificationTable();

  const batchSize = typeof opts === 'number' ? opts : (opts.batchSize || 500);
  const targetEventId = typeof opts === 'object' ? opts.eventId : null;

  let queryText = `SELECT id, event_type, aggregate_type, aggregate_id, payload, correlation_id
     FROM outbox_events
     WHERE status = 'PENDING'`;
  const params = [];

  if (targetEventId) {
    queryText += ` AND id = $1`;
    params.push(targetEventId);
  }

  queryText += ` ORDER BY created_at ASC LIMIT $${params.length + 1}`;
  params.push(batchSize);

  const eventsRes = await query(queryText, params);

  let processedCount = 0;
  for (const evt of eventsRes.rows) {
    const eventId = evt.id;
    const eventType = evt.event_type;
    const payload = typeof evt.payload === 'string' ? JSON.parse(evt.payload) : (evt.payload || {});
    const userId = payload.userId || payload.user_id || 'system';
    const category = getEventCategory(eventType);

    try {
      // 1. If Admin Event -> Create admin_notifications record & Broadcast WebSocket Alert
      if (isAdminEvent(eventType)) {
        const notifId = `anot_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const title = `Alert: ${eventType}`;
        const message = payload.message || payload.text || `Critical alert for event ${eventType}`;

        await query(
          `INSERT INTO admin_notifications (notification_id, admin_id, title, message, category, priority, created_at)
           VALUES ($1, 'admin', $2, $3, $4, $5, NOW())
           ON CONFLICT DO NOTHING`,
          [notifId, title, message, category, payload.severity || 'HIGH']
        );

        // Real-Time Admin Header Bell Broadcast via Phase 8 WebSocket
        broadcastWsMessage('admin.alert.created', {
          notificationId: notifId,
          title,
          message,
          category,
          priority: payload.severity || 'HIGH',
          timestamp: Date.now(),
        });
      }

      // 2. User Event Processing
      if (userId && userId !== 'system') {
        // Never synthesize users from notifications — skip if identity is missing.
        const userExists = await query(
          `SELECT 1 FROM users WHERE user_id = $1 LIMIT 1`,
          [userId],
        );
        if (!userExists.rows.length) {
          await query(
            `UPDATE outbox_events SET status = 'PROCESSED', processed_at = NOW() WHERE id = $1`,
            [eventId],
          ).catch(() => {});
          processedCount += 1;
          continue;
        }

        const prefs = await getUserPreferences(userId);
        const channels = ['IN_APP', 'EMAIL', 'PUSH'];

        for (const channel of channels) {
          if (!isChannelAllowedForUser(prefs, category, channel)) continue;

          // Defer promotional notifications during quiet hours
          if (category === 'PROMOTION' && isQuietHoursActive()) continue;

          const rendered = await notificationTemplateEngine.renderTemplate({
            eventType,
            channel: channel === 'PUSH' ? 'IN_APP' : channel,
            variables: { ...payload, user_name: userId },
          });

          // Notif ID <= 64 characters
          const notifId = `ntf_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

          // Application-level & Primary Key Idempotency Guard
          const existingNotif = await query(
            `SELECT id FROM notifications WHERE event_id = $1 AND event_type = $2 AND user_id = $3 AND channel = $4`,
            [eventId, eventType, userId, channel]
          );

          if (existingNotif.rows.length === 0) {
            await query(
              `INSERT INTO notifications (id, user_id, event_type, category, channel, recipient, subject, body, status, event_id, tenant_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'QUEUED', $9, 'tenant_default')
               ON CONFLICT (id) DO NOTHING`,
              [notifId, userId, eventType, category, channel, channel === 'EMAIL' ? (payload.email || `${userId}@oddsyra.com`) : userId, rendered.subject, rendered.body, eventId]
            );
          }
        }
      }

      // Mark outbox event PROCESSED
      await query(
        `UPDATE outbox_events SET status = 'PROCESSED', processed_at = NOW() WHERE id = $1`,
        [eventId]
      );
      processedCount++;
    } catch (err) {
      console.error(`[Outbox Worker Error on event ${eventId}]`, err.message);
      await query(
        `UPDATE outbox_events SET attempts = attempts + 1, error_message = $1 WHERE id = $2`,
        [err.message, eventId]
      );
    }
  }

  return { success: true, processedCount, totalFetched: eventsRes.rows.length };
}

function isAdminEvent(eventType) {
  return [
    'fraud.signal.created',
    'system.alert',
    'provider.failure',
    'kyc.submitted',
    'withdrawal.created',
    'support.conversation.created',
    'support.message.created',
    'support.ticket.created',
  ].includes(eventType);
}

function getEventCategory(eventType) {
  if (eventType.startsWith('bet.')) return 'BETTING';
  if (eventType.startsWith('deposit.') || eventType.startsWith('withdrawal.')) return 'PAYMENT';
  if (eventType.startsWith('kyc.')) return 'KYC';
  if (eventType.startsWith('fraud.')) return 'FRAUD';
  if (eventType.startsWith('bonus.')) return 'PROMOTION';
  if (eventType.startsWith('support.')) return 'SUPPORT';
  return 'SYSTEM';
}
