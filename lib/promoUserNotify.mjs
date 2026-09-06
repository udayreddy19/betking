/**
 * In-app + browser notify when a promo email is sent.
 * Gmail often files promos@ mail in Promotions (no lock-screen alert).
 */

import { query } from '../db/pg.js';
import { broadcastWsMessage, sendToUser } from './websocketEngine.mjs';

function notifId() {
  return `promo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 280);
}

/**
 * @param {{ userId: string, subject?: string, message?: string, url?: string, eventId?: string }} opts
 */
export async function notifyUserPromoOffer({
  userId,
  subject,
  message,
  url = '/promotions',
  eventId,
} = {}) {
  if (!userId) return null;
  const title = String(subject || 'New offer from OddsYra').trim().slice(0, 180);
  const body = stripHtml(message) || 'Open OddsYra to view your offer.';
  const id = notifId();
  const eid = eventId || id;

  try {
    await query(
      `INSERT INTO notifications
         (id, user_id, event_type, category, channel, recipient, subject, body, status, event_id, is_read, attempts)
       VALUES ($1, $2, 'PROMO_OFFER', 'PROMOTIONAL', 'IN_APP', $2, $3, $4, 'DELIVERED', $5, FALSE, 0)
       ON CONFLICT (id) DO NOTHING`,
      [id, userId, title, body, eid],
    );
  } catch (err) {
    console.error('[promoUserNotify] insert', err.message);
    return null;
  }

  const wsPayload = {
    notificationId: id,
    userId,
    eventType: 'PROMO_OFFER',
    category: 'PROMOTIONAL',
    subject: title,
    message: body,
    url,
    is_read: false,
    timestamp: Date.now(),
  };
  try {
    broadcastWsMessage('user.notification.created', wsPayload);
    sendToUser(userId, 'user.notification.created', wsPayload);
  } catch {
    // websocket optional
  }

  try {
    const { sendWebPush } = await import('./notificationChannels.mjs');
    void sendWebPush({
      userId,
      subject: title,
      body,
      data: { eventType: 'PROMO_OFFER', url },
    }).catch(() => {});
  } catch {
    // webpush optional
  }

  return id;
}
