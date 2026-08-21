/**
 * Support → in-app notifications for admin bell + user bell.
 * Writes directly (no outbox lag) so ticket activity shows immediately.
 */

import { query } from '../db/pg.js';
import { broadcastWsMessage } from './websocketEngine.mjs';
import { ensureAdminNotificationTable } from './notificationWorker.mjs';

function notifId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function notifyAdminSupportEvent({
  title,
  message,
  conversationId,
  priority = 'HIGH',
}) {
  try {
    await ensureAdminNotificationTable();
    const id = notifId('anot');
    await query(
      `INSERT INTO admin_notifications
         (notification_id, admin_id, title, message, category, priority,
          action_type, action_target_type, action_target_id, action_label, is_read, created_at)
       VALUES ($1, 'admin', $2, $3, 'SUPPORT', $4, 'OPEN_TICKET', 'support_conversation', $5, 'Open ticket', FALSE, NOW())
       ON CONFLICT DO NOTHING`,
      [id, title, message, priority, conversationId || null],
    );
    broadcastWsMessage('admin.alert.created', {
      notificationId: id,
      title,
      message,
      category: 'SUPPORT',
      priority,
      conversationId,
      timestamp: Date.now(),
    });
    return id;
  } catch (err) {
    console.error('[supportNotify] admin', err.message);
    return null;
  }
}

export async function notifyUserSupportEvent({
  userId,
  eventType,
  subject,
  message,
  conversationId,
  eventId,
}) {
  if (!userId) return null;
  try {
    const id = notifId('ntf');
    const eid = eventId || id;
    try {
      await query(
        `INSERT INTO notifications
           (id, user_id, event_type, category, channel, recipient, subject, body, status, event_id, is_read, attempts)
         VALUES ($1, $2, $3, 'SUPPORT', 'IN_APP', $2, $4, $5, 'DELIVERED', $6, FALSE, 0)
         ON CONFLICT (id) DO NOTHING`,
        [id, userId, eventType, subject, message, eid],
      );
    } catch {
      await query(
        `INSERT INTO notifications
           (id, user_id, event_type, category, channel, recipient, subject, body, status, event_id, is_read, attempts, tenant_id)
         VALUES ($1, $2, $3, 'SUPPORT', 'IN_APP', $2, $4, $5, 'DELIVERED', $6, FALSE, 0, 'oddsyra_in')
         ON CONFLICT (id) DO NOTHING`,
        [id, userId, eventType, subject, message, eid],
      );
    }
    broadcastWsMessage('user.notification.created', {
      notificationId: id,
      userId,
      eventType,
      subject,
      message,
      conversationId,
      timestamp: Date.now(),
    });
    return id;
  } catch (err) {
    console.error('[supportNotify] user', err.message);
    return null;
  }
}
