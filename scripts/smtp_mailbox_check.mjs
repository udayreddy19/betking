/**
 * One-shot SMTP verify for OddsYra mailboxes (run inside backend container).
 * Does not print secrets — only pass presence / verify result.
 */
import nodemailer from 'nodemailer';

function check(label, host, port, secure, user, pass) {
  return {
    label,
    host,
    port: Number(port) || 465,
    secure: String(secure) === 'true' || Number(port) === 465,
    user,
    pass: pass || '',
  };
}

const accounts = [
  check(
    'no-reply',
    process.env.SMTP_HOST,
    process.env.SMTP_PORT,
    process.env.SMTP_SECURE,
    process.env.SMTP_USER,
    process.env.SMTP_PASSWORD,
  ),
  check(
    'promos',
    process.env.SMTP_PROMOS_HOST || process.env.SMTP_HOST,
    process.env.SMTP_PROMOS_PORT || process.env.SMTP_PORT,
    process.env.SMTP_PROMOS_SECURE || process.env.SMTP_SECURE,
    process.env.SMTP_PROMOS_USER,
    process.env.SMTP_PROMOS_PASSWORD,
  ),
  check(
    'support(via-primary-pass)',
    process.env.SMTP_HOST,
    process.env.SMTP_PORT,
    process.env.SMTP_SECURE,
    'support@oddsyra.com',
    process.env.SMTP_SUPPORT_PASSWORD || process.env.SUPPORT_SMTP_PASSWORD || process.env.SMTP_PASSWORD,
  ),
  check(
    'alerts(via-primary-pass)',
    process.env.SMTP_HOST,
    process.env.SMTP_PORT,
    process.env.SMTP_SECURE,
    'alerts@oddsyra.com',
    process.env.SMTP_ALERTS_PASSWORD || process.env.ALERTS_SMTP_PASSWORD || process.env.SMTP_PASSWORD,
  ),
  check(
    'payments(via-primary-pass)',
    process.env.SMTP_HOST,
    process.env.SMTP_PORT,
    process.env.SMTP_SECURE,
    'payments@oddsyra.com',
    process.env.SMTP_PAYMENTS_PASSWORD || process.env.PAYMENTS_SMTP_PASSWORD || process.env.SMTP_PASSWORD,
  ),
  check(
    'fallback',
    process.env.SMTP_FALLBACK_HOST,
    process.env.SMTP_FALLBACK_PORT,
    process.env.SMTP_FALLBACK_SECURE,
    process.env.SMTP_FALLBACK_USER,
    process.env.SMTP_FALLBACK_PASSWORD || process.env.SMTP_FALLBACK_PASS,
  ),
];

const results = [];
for (const a of accounts) {
  const base = {
    label: a.label,
    user: a.user || null,
    host: a.host || null,
    port: a.port,
    hasPass: Boolean(a.pass),
  };
  if (!a.host || !a.user || !a.pass) {
    results.push({ ...base, ok: false, error: 'missing_config' });
    continue;
  }
  try {
    const t = nodemailer.createTransport({
      host: a.host,
      port: a.port,
      secure: a.secure,
      auth: { user: a.user, pass: a.pass },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    });
    await t.verify();
    results.push({ ...base, ok: true });
  } catch (e) {
    results.push({
      ...base,
      ok: false,
      error: e.message,
      code: e.code || null,
      responseCode: e.responseCode || null,
    });
  }
}

console.log(JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2));
