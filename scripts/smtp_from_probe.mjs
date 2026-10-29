import {
  sendEmail,
  SUPPORT_FROM,
  ALERTS_FROM,
  PROMOS_FROM,
  getDedicatedAccountForFrom,
  promosSmtpAccount,
} from './server/auth/emailService.js';

const to = String(process.env.ADMIN_EMAILS || '').split(',')[0].trim();
const stamp = new Date().toISOString();
const out = {
  to,
  promosConfigured: Boolean(promosSmtpAccount()),
  dedicated: {
    support: Boolean(getDedicatedAccountForFrom(SUPPORT_FROM)),
    alerts: Boolean(getDedicatedAccountForFrom(ALERTS_FROM)),
    promos: Boolean(getDedicatedAccountForFrom(PROMOS_FROM)),
  },
};

for (const [label, from] of [
  ['support', SUPPORT_FROM],
  ['alerts', ALERTS_FROM],
  ['promos', PROMOS_FROM],
]) {
  try {
    const r = await sendEmail({
      to,
      subject: `[OddsYra] SMTP probe ${label} ${stamp}`,
      html: `<p>Probe ${label} at ${stamp}</p>`,
      from,
      forceFrom: true,
    });
    out[label] = { ok: r.success !== false, provider: r.provider, messageId: r.messageId };
  } catch (e) {
    out[label] = { ok: false, error: e.message, responseCode: e.responseCode || null };
  }
}

console.log(JSON.stringify(out, null, 2));
