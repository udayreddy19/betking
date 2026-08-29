import { isWebPushConfigured as isPushConfigured, sendWebPushToUser, getWebPushStatus } from './webPushEngine.mjs';

/**
 * Enterprise Notification Channels Adapter
 * SMS is DISABLED by product policy.
 * Web Push (RFC 8292 / VAPID) is fully supported.
 */

export const SMS_NOTIFICATIONS_ENABLED = false;
export const DISABLED_BY_CONFIGURATION = true;

export function isSmsConfigured() {
  return false; // Permanently disabled by policy
}

export function isWebPushConfigured() {
  return isPushConfigured();
}

/**
 * SMS is cleanly disabled.
 * Never attempts delivery, never causes retries or log floods.
 */
export async function sendDltSms() {
  return { delivered: false, skipped: true, reason: 'SMS_DISABLED_BY_POLICY' };
}

/**
 * Dispatch Browser Push Notification via WebPush Engine
 */
export async function sendWebPush({ userId, subscription, body, subject, tag, data }) {
  if (!isPushConfigured()) {
    return { delivered: false, skipped: true, reason: 'WEB_PUSH_NOT_CONFIGURED' };
  }

  if (userId) {
    return await sendWebPushToUser(userId, {
      title: subject,
      body,
      tag,
      data,
    });
  }

  if (subscription) {
    const { sendWebPushToSubscription } = await import('./webPushEngine.mjs');
    return await sendWebPushToSubscription(subscription, {
      title: subject,
      body,
      tag,
      data,
    });
  }

  return { delivered: false, skipped: true, reason: 'NO_RECIPIENT_OR_USER_SPECIFIED' };
}

/**
 * Server-Authoritative Channel Dispatcher
 */
export async function dispatchNotificationChannel(channel, recipient, body, subject = '', opts = {}) {
  const ch = String(channel || '').toUpperCase();

  if (ch === 'IN_APP' || ch === 'ADMIN') {
    return { delivered: true, channel: ch };
  }

  if (ch === 'EMAIL') {
    if (!process.env.SMTP_HOST && !process.env.SMTP_USER) {
      return { delivered: false, skipped: true, reason: 'SMTP_NOT_CONFIGURED' };
    }
    try {
      const { sendGenericNotificationEmail } = await import('../server/auth/emailService.js');
      return await sendGenericNotificationEmail({
        to: recipient,
        subject: subject || 'OddsYra notification',
        text: body,
        html: `<pre style="font-family:sans-serif;white-space:pre-wrap">${String(body || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')}</pre>`,
      });
    } catch (err) {
      throw new Error(err?.message || 'EMAIL_SEND_FAILED');
    }
  }

  if (ch === 'SMS') {
    // Disabled cleanly by configuration
    return { delivered: false, skipped: true, reason: 'SMS_DISABLED_BY_POLICY' };
  }

  if (ch === 'PUSH' || ch === 'WEB_PUSH') {
    let subscription = null;
    let userId = null;

    if (typeof recipient === 'string' && recipient.startsWith('{')) {
      try {
        subscription = JSON.parse(recipient);
      } catch {
        userId = recipient;
      }
    } else {
      userId = recipient;
    }

    const result = await sendWebPush({
      userId,
      subscription,
      body,
      subject,
      tag: opts.tag,
      data: opts.data,
    });

    if (result.skipped) return { delivered: false, skipped: true, reason: result.reason };
    return result;
  }

  return { delivered: false, skipped: true, reason: 'UNKNOWN_CHANNEL' };
}
