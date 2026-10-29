/**
 * Safe live send probe via OddsYra emailService (no-reply + optional promos).
 * Recipient = first ADMIN_EMAILS entry (or SMTP_PROBE_TO).
 */
import {
  sendEmail,
  sendWelcomeEmail,
  PROMOS_FROM,
  getEmailDeliveryMetrics,
  promosSmtpAccount,
  supportSmtpAccount,
  alertsSmtpAccount,
  paymentsSmtpAccount,
} from '../server/auth/emailService.js';

const admin = String(process.env.SMTP_PROBE_TO || process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)[0];

if (!admin) {
  console.error(JSON.stringify({ ok: false, error: 'No ADMIN_EMAILS / SMTP_PROBE_TO' }));
  process.exit(1);
}

const stamp = new Date().toISOString();
const accounts = {
  promos: Boolean(promosSmtpAccount()),
  support: Boolean(supportSmtpAccount()),
  alerts: Boolean(alertsSmtpAccount()),
  payments: Boolean(paymentsSmtpAccount()),
};

const results = [];

async function probe(label, fn) {
  try {
    const r = await fn();
    results.push({
      label,
      ok: r?.success !== false,
      provider: r?.provider || null,
      messageId: r?.messageId || null,
      error: r?.error || null,
    });
  } catch (e) {
    results.push({ label, ok: false, error: e.message, code: e.code || null, responseCode: e.responseCode || null });
  }
}

await probe('welcome_no-reply', () => sendWelcomeEmail({ email: admin, name: 'OddsYra Mail Probe' }));
await probe('raw_no-reply', () => sendEmail({
  to: admin,
  subject: `[OddsYra] SMTP probe no-reply ${stamp}`,
  html: `<p>Live SMTP probe from no-reply at ${stamp}.</p>`,
}));

if (accounts.promos) {
  await probe('promos_from', () => sendEmail({
    to: admin,
    subject: `[OddsYra] SMTP probe promos ${stamp}`,
    html: `<p>Live SMTP probe from promos mailbox at ${stamp}.</p>`,
    from: PROMOS_FROM,
    forceFrom: true,
  }));
} else {
  results.push({ label: 'promos_from', ok: false, error: 'promos_smtp_not_configured' });
}

console.log(JSON.stringify({
  checkedAt: stamp,
  to: admin,
  accounts,
  results,
  metrics: getEmailDeliveryMetrics(),
}, null, 2));
