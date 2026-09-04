import webpush from 'web-push';
import { query } from '../db/pg.js';

/**
 * Enterprise Server-Authoritative Web Push Engine (RFC 8292 / VAPID)
 */

const WEB_PUSH_ENABLED = process.env.WEB_PUSH_ENABLED !== 'false';
const VAPID_PUBLIC_KEY = process.env.WEB_PUSH_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.WEB_PUSH_VAPID_PRIVATE_KEY || process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.WEB_PUSH_SUBJECT || process.env.VAPID_SUBJECT || 'mailto:security@oddsyra.com';

let vapidConfigured = false;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    vapidConfigured = true;
  } catch (err) {
    console.error('[WebPush Init Error]', err.message);
  }
}

/**
 * Log startup status cleanly WITHOUT exposing private keys
 */
export function logWebPushStartupStatus() {
  if (!WEB_PUSH_ENABLED) {
    console.log('Browser Push: DISABLED — WEB_PUSH_ENABLED=false');
  } else if (vapidConfigured) {
    console.log('Browser Push: ENABLED (VAPID configured)');
  } else {
    console.log('Browser Push: DISABLED — VAPID keys missing (ready for configuration)');
  }
}

export function isWebPushConfigured() {
  return WEB_PUSH_ENABLED && vapidConfigured;
}

export function getWebPushStatus() {
  return {
    enabled: WEB_PUSH_ENABLED,
    configured: vapidConfigured,
    vapidPublicKey: vapidConfigured ? VAPID_PUBLIC_KEY : null,
    subject: VAPID_SUBJECT,
  };
}

/**
 * Save / Upsert user push subscription
 */
export async function savePushSubscription({
  userId,
  endpoint,
  p256dh,
  auth,
  userAgent = '',
}) {
  if (!userId || !endpoint || !p256dh || !auth) {
    throw new Error('Missing required subscription fields (userId, endpoint, p256dh, auth)');
  }

  const subId = `psub_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  const res = await query(
    `INSERT INTO user_push_subscriptions (
       id, user_id, endpoint, p256dh, auth, user_agent, status, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', NOW(), NOW())
     ON CONFLICT (user_id, endpoint) DO UPDATE SET
       p256dh = EXCLUDED.p256dh,
       auth = EXCLUDED.auth,
       user_agent = COALESCE(EXCLUDED.user_agent, user_push_subscriptions.user_agent),
       status = 'ACTIVE',
       error_count = 0,
       updated_at = NOW()
     RETURNING id, user_id, endpoint, status, updated_at;`,
    [subId, userId, endpoint, p256dh, auth, String(userAgent || '').slice(0, 512)],
  );

  return res.rows[0];
}

/**
 * Unsubscribe / Deactivate user push subscription
 */
export async function removePushSubscription({ userId, endpoint }) {
  if (!userId) throw new Error('userId is required');

  if (endpoint) {
    const res = await query(
      `UPDATE user_push_subscriptions
       SET status = 'INACTIVE', updated_at = NOW()
       WHERE user_id = $1 AND endpoint = $2
       RETURNING id, status;`,
      [userId, endpoint],
    );
    return { success: true, updatedCount: res.rowCount };
  }

  const res = await query(
    `UPDATE user_push_subscriptions
     SET status = 'INACTIVE', updated_at = NOW()
     WHERE user_id = $1 AND status = 'ACTIVE'
     RETURNING id, status;`,
    [userId],
  );
  return { success: true, updatedCount: res.rowCount };
}

/**
 * Get all active subscriptions for user
 */
export async function getUserActivePushSubscriptions(userId) {
  if (!userId) return [];
  const res = await query(
    `SELECT id, user_id, endpoint, p256dh, auth, status, error_count, last_success_at
     FROM user_push_subscriptions
     WHERE user_id = $1 AND status = 'ACTIVE'`,
    [userId],
  );
  return res.rows;
}

/**
 * Dispatch Web Push to a single subscription
 */
export async function sendWebPushToSubscription(subscription, payload = {}) {
  if (!isWebPushConfigured()) {
    return { delivered: false, skipped: true, reason: 'WEB_PUSH_NOT_CONFIGURED' };
  }

  const pushSubscription = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.p256dh,
      auth: subscription.auth,
    },
  };

  const notificationPayload = JSON.stringify({
    title: payload.title || 'OddsYra Update',
    body: payload.body || payload.message || '',
    icon: payload.icon || '/assets/BrandLogo.png',
    badge: payload.badge || '/assets/BrandLogo.png',
    tag: payload.tag || `notif_${Date.now()}`,
    data: {
      url: payload.data?.url || payload.url || '/notifications',
      timestamp: Date.now(),
      ...payload.data,
    },
  });

  try {
    const res = await webpush.sendNotification(pushSubscription, notificationPayload, {
      TTL: 60 * 60 * 24, // 24 hours
      urgency: 'high',
    });

    await query(
      `UPDATE user_push_subscriptions
       SET last_success_at = NOW(), error_count = 0, updated_at = NOW()
       WHERE endpoint = $1`,
      [subscription.endpoint],
    ).catch(() => null);

    return { delivered: true, statusCode: res.statusCode };
  } catch (err) {
    const statusCode = err.statusCode || err.status || 0;

    // 404 Not Found or 410 Gone means the subscription is permanently expired
    if (statusCode === 404 || statusCode === 410) {
      await query(
        `UPDATE user_push_subscriptions
         SET status = 'EXPIRED', updated_at = NOW(), error_count = error_count + 1
         WHERE endpoint = $1`,
        [subscription.endpoint],
      ).catch(() => null);
      return { delivered: false, expired: true, statusCode, reason: 'SUBSCRIPTION_EXPIRED' };
    }

    await query(
      `UPDATE user_push_subscriptions
       SET error_count = error_count + 1, updated_at = NOW()
       WHERE endpoint = $1`,
      [subscription.endpoint],
    ).catch(() => null);

    throw err;
  }
}

/**
 * Dispatch Web Push to all active devices of a user
 */
export async function sendWebPushToUser(userId, payload = {}) {
  const subscriptions = await getUserActivePushSubscriptions(userId);
  if (subscriptions.length === 0) {
    return { delivered: false, skipped: true, reason: 'NO_ACTIVE_SUBSCRIPTIONS' };
  }

  const results = await Promise.allSettled(
    subscriptions.map((sub) => sendWebPushToSubscription(sub, payload)),
  );

  let successCount = 0;
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value?.delivered) successCount++;
  }

  return {
    delivered: successCount > 0,
    totalDevices: subscriptions.length,
    successCount,
  };
}
