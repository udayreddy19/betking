/**
 * India DLT SMS + Web Push adapters.
 * Stay no-op until credentials are set — never invent a licensed provider.
 */

const SMS_ENDPOINT = process.env.SMS_DLT_API_URL || '';
const SMS_API_KEY = process.env.SMS_DLT_API_KEY || '';
const SMS_SENDER_ID = process.env.SMS_DLT_SENDER_ID || '';
const SMS_ENTITY_ID = process.env.SMS_DLT_ENTITY_ID || '';
const SMS_TEMPLATE_ID = process.env.SMS_DLT_TEMPLATE_ID || '';

const PUSH_ENDPOINT = process.env.WEB_PUSH_DISPATCH_URL || '';
const PUSH_VAPID_PUBLIC = process.env.WEB_PUSH_VAPID_PUBLIC || '';

export function isSmsConfigured() {
  return Boolean(SMS_ENDPOINT && SMS_API_KEY && SMS_SENDER_ID && SMS_ENTITY_ID && SMS_TEMPLATE_ID);
}

export function isWebPushConfigured() {
  return Boolean(PUSH_ENDPOINT && PUSH_VAPID_PUBLIC);
}

export async function sendDltSms({ to, body }) {
  const { isEmailFailoverMonitored } = await import('../server/auth/emailService.js');
  if (!isEmailFailoverMonitored()) {
    return { delivered: false, skipped: true, reason: 'EMAIL_FAILOVER_NOT_MONITORED' };
  }
  if (!isSmsConfigured()) {
    return { delivered: false, skipped: true, reason: 'SMS_NOT_CONFIGURED' };
  }
  const res = await fetch(SMS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SMS_API_KEY}`,
    },
    body: JSON.stringify({
      to,
      senderId: SMS_SENDER_ID,
      entityId: SMS_ENTITY_ID,
      templateId: SMS_TEMPLATE_ID,
      message: body,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`SMS_PROVIDER_${res.status}: ${text.slice(0, 120)}`);
  }
  return { delivered: true, channel: 'SMS' };
}

export async function sendWebPush({ subscription, body, subject }) {
  const { isEmailFailoverMonitored } = await import('../server/auth/emailService.js');
  if (!isEmailFailoverMonitored()) {
    return { delivered: false, skipped: true, reason: 'EMAIL_FAILOVER_NOT_MONITORED' };
  }
  if (!isWebPushConfigured()) {
    return { delivered: false, skipped: true, reason: 'WEB_PUSH_NOT_CONFIGURED' };
  }
  const res = await fetch(PUSH_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscription,
      title: subject,
      body,
      vapidPublicKey: PUSH_VAPID_PUBLIC,
    }),
  });
  if (!res.ok) {
    throw new Error(`WEB_PUSH_PROVIDER_${res.status}`);
  }
  return { delivered: true, channel: 'PUSH' };
}

export async function dispatchNotificationChannel(channel, recipient, body, subject = '') {
  const ch = String(channel || '').toUpperCase();
  if (ch === 'IN_APP' || ch === 'ADMIN' || ch === 'EMAIL') {
    return { delivered: true, skipped: ch === 'EMAIL' && !process.env.SMTP_HOST };
  }
  if (ch === 'SMS') {
    const result = await sendDltSms({ to: recipient, body });
    if (result.skipped) return { delivered: true, skipped: true, reason: result.reason };
    return result;
  }
  if (ch === 'PUSH' || ch === 'WEB_PUSH') {
    let subscription = recipient;
    try {
      subscription = typeof recipient === 'string' && recipient.startsWith('{')
        ? JSON.parse(recipient)
        : recipient;
    } catch {
      subscription = recipient;
    }
    const result = await sendWebPush({ subscription, body, subject });
    if (result.skipped) return { delivered: true, skipped: true, reason: result.reason };
    return result;
  }
  return { delivered: true };
}
