/**
 * Transactional Email Service — OddsYra Authentication
 *
 * Primary SMTP (Resend) with optional Brevo fallback when the primary
 * hits quota / rate-limit errors or SMTP_PRIMARY_DAILY_LIMIT.
 *
 * SMTP_HOST / SMTP_USER / SMTP_PASSWORD — primary (Resend)
 * SMTP_FALLBACK_HOST / SMTP_FALLBACK_USER / SMTP_FALLBACK_PASSWORD — backup (Brevo)
 */

import nodemailer from 'nodemailer';
import { logger } from '../../lib/logger.mjs';

const FRONTEND_URL = process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:5173';
const isProduction = process.env.NODE_ENV === 'production';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const SMTP_FROM = process.env.SMTP_FROM || 'OddsYra Security <no-reply@oddsyra.com>';
const PRIMARY_DAILY_LIMIT = Math.max(0, parseInt(process.env.SMTP_PRIMARY_DAILY_LIMIT || '0', 10) || 0);

const quotaState = {
  dayKey: utcDayKey(),
  primarySent: 0,
  primaryExhaustedUntil: 0,
};

const deliveryMetrics = {
  primarySuccess: 0,
  fallbackSuccess: 0,
  primaryFailure: 0,
  fallbackFailure: 0,
  lastProvider: null,
  lastError: null,
  lastAt: null,
};

export function getEmailDeliveryMetrics() {
  return {
    ...deliveryMetrics,
    fallbackConfigured: Boolean(envAccount('SMTP_FALLBACK_')),
    primaryConfigured: Boolean(envAccount('SMTP_')),
    monitored: Boolean(envAccount('SMTP_FALLBACK_')),
  };
}

/** SMS/push wait until Brevo fallback SMTP is configured so failover can be observed. */
export function isEmailFailoverMonitored() {
  return Boolean(envAccount('SMTP_FALLBACK_'));
}

export function resetEmailDeliveryMetricsForTests() {
  deliveryMetrics.primarySuccess = 0;
  deliveryMetrics.fallbackSuccess = 0;
  deliveryMetrics.primaryFailure = 0;
  deliveryMetrics.fallbackFailure = 0;
  deliveryMetrics.lastProvider = null;
  deliveryMetrics.lastError = null;
  deliveryMetrics.lastAt = null;
}

function utcDayKey(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

function rollQuotaWindow(now = Date.now()) {
  const key = utcDayKey(now);
  if (quotaState.dayKey !== key) {
    quotaState.dayKey = key;
    quotaState.primarySent = 0;
    quotaState.primaryExhaustedUntil = 0;
  }
}

export function isQuotaOrRateLimitError(err) {
  const code = Number(err?.responseCode || err?.status || 0);
  if (code === 429 || code === 421 || code === 452) return true;
  const msg = `${err?.message || ''} ${err?.response || ''} ${err?.responseCode || ''}`.toLowerCase();
  return /quota|rate.?limit|too many|daily limit|exceeded|maximum.*email|limit reached|try again later/.test(msg);
}

function envAccount(prefix) {
  const host = process.env[`${prefix}HOST`];
  const user = process.env[`${prefix}USER`];
  const pass = process.env[`${prefix}PASSWORD`] || process.env[`${prefix}PASS`];
  if (!host || !user || !pass) return null;
  const port = parseInt(process.env[`${prefix}PORT`] || '', 10) || 587;
  const secureEnv = process.env[`${prefix}SECURE`];
  const secure = secureEnv === 'true' || (secureEnv !== 'false' && port === 465);
  const fromRaw = process.env[`${prefix}FROM`] || SMTP_FROM;
  const from = String(fromRaw || '').includes('@')
    ? fromRaw
    : 'no-reply@oddsyra.com';
  return { name: prefix.startsWith('SMTP_FALLBACK') ? 'fallback' : 'primary', host, port, secure, user, pass, from };
}

function configuredAccounts() {
  const primary = envAccount('SMTP_');
  const fallback = envAccount('SMTP_FALLBACK_');
  const accounts = [];
  if (primary) accounts.push(primary);
  if (fallback) accounts.push(fallback);
  return accounts;
}

/**
 * Light-on-cream HTML for mail clients. Gmail iOS dark mode inverts
 * dark templates and leaves body copy unreadable.
 */
function renderTransactionalEmail({ heading, greetingName, introHtml, ctaLabel, ctaHref, noteHtml, extraHtml = '' }) {
  const year = new Date().getFullYear();
  const safeHeading = escapeHtml(heading);
  const safeCta = escapeHtml(ctaLabel);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light">
  <title>${safeHeading}</title>
  <style>
    :root { color-scheme: light only; }
    @media (prefers-color-scheme: dark) {
      .oy-body, .oy-card, .oy-td { background-color: #fbf8f2 !important; color: #14181f !important; }
      .oy-muted { color: #5c6570 !important; }
      .oy-brand { color: #1f8a4c !important; }
      .oy-gold { color: #c98a12 !important; }
      .oy-link { color: #166b3a !important; }
    }
  </style>
</head>
<body class="oy-body" bgcolor="#efeae0" style="margin:0;padding:24px 12px;background-color:#efeae0;color:#14181f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center">
        <table class="oy-card" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#fbf8f2" style="max-width:560px;background-color:#fbf8f2;border:1px solid #ddd4c4;border-radius:12px;">
          <tr>
            <td class="oy-td" style="padding:28px 24px 8px;font-size:22px;font-weight:800;letter-spacing:0.06em;">
              <span class="oy-brand" style="color:#1f8a4c;">ODDS</span><span class="oy-gold" style="color:#c98a12;">YRA</span>
            </td>
          </tr>
          <tr>
            <td class="oy-td" style="padding:8px 24px 0;font-size:22px;font-weight:800;line-height:1.3;color:#14181f;">${safeHeading}</td>
          </tr>
          <tr>
            <td class="oy-td" style="padding:16px 24px 0;font-size:16px;line-height:1.55;color:#14181f;">
              Hi <strong>${escapeHtml(greetingName)}</strong>,
            </td>
          </tr>
          <tr>
            <td class="oy-td" style="padding:12px 24px 0;font-size:16px;line-height:1.55;color:#14181f;">${introHtml}</td>
          </tr>
          <tr>
            <td align="center" class="oy-td" style="padding:24px;">
              <a href="${ctaHref}" target="_blank" style="display:inline-block;background-color:#1f8a4c;color:#ffffff !important;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">${safeCta}</a>
            </td>
          </tr>
          <tr>
            <td class="oy-muted oy-td" style="padding:0 24px;font-size:13px;line-height:1.5;color:#5c6570;">Or copy and paste this link in your browser:</td>
          </tr>
          <tr>
            <td class="oy-td" style="padding:10px 24px 0;">
              <div style="background-color:#f6f2ea;border:1px dashed #1f8a4c;border-radius:8px;padding:12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.45;word-break:break-all;overflow-wrap:anywhere;">
                <a class="oy-link" href="${ctaHref}" style="color:#166b3a;text-decoration:underline;">${escapeHtml(ctaHref)}</a>
              </div>
            </td>
          </tr>
          ${extraHtml}
          <tr>
            <td class="oy-muted oy-td" style="padding:20px 24px 0;font-size:13px;line-height:1.5;color:#5c6570;">${noteHtml}</td>
          </tr>
          <tr>
            <td class="oy-muted oy-td" style="padding:24px;font-size:12px;line-height:1.5;color:#5c6570;border-top:1px solid #ddd4c4;">
              © ${year} OddsYra Sportsbook &amp; Casino. All rights reserved.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function createTransport(account) {
  if (!account) {
    return nodemailer.createTransport({ jsonTransport: true });
  }
  return nodemailer.createTransport({
    host: account.host,
    port: account.port,
    secure: account.secure,
    requireTLS: !account.secure,
    auth: { user: account.user, pass: account.pass },
  });
}

function shouldSkipPrimary(now = Date.now()) {
  rollQuotaWindow(now);
  if (quotaState.primaryExhaustedUntil > now) return true;
  if (PRIMARY_DAILY_LIMIT > 0 && quotaState.primarySent >= PRIMARY_DAILY_LIMIT) return true;
  return false;
}

function markPrimarySuccess() {
  rollQuotaWindow();
  quotaState.primarySent += 1;
  if (PRIMARY_DAILY_LIMIT > 0 && quotaState.primarySent >= PRIMARY_DAILY_LIMIT) {
    quotaState.primaryExhaustedUntil = Date.now() + 60 * 60 * 1000;
  }
}

function markPrimaryQuotaHit() {
  rollQuotaWindow();
  quotaState.primaryExhaustedUntil = Date.now() + 6 * 60 * 60 * 1000;
}

async function sendMailWithFailover({ to, subject, html, text }) {
  const accounts = configuredAccounts();
  if (accounts.length === 0) {
    if (isProduction) {
      throw new Error('SMTP is not configured (missing host, user, or password)');
    }
    const tx = createTransport(null);
    const info = await tx.sendMail({ from: SMTP_FROM, to, subject, html, text });
    return { success: true, messageId: info.messageId, provider: 'dev-json' };
  }

  const skipPrimary = shouldSkipPrimary();
  const ordered = skipPrimary && accounts.length > 1
    ? [accounts[1], accounts[0]]
    : accounts;

  let lastError = null;
  for (const account of ordered) {
    try {
      const tx = createTransport(account);
      const info = await tx.sendMail({
        from: account.from,
        to,
        subject,
        html,
        text,
      });
      if (account.name === 'primary') markPrimarySuccess();
      if (account.name === 'primary') deliveryMetrics.primarySuccess += 1;
      else deliveryMetrics.fallbackSuccess += 1;
      deliveryMetrics.lastProvider = account.name;
      deliveryMetrics.lastError = null;
      deliveryMetrics.lastAt = new Date().toISOString();
      logger.info('email_sent', { provider: account.name });
      return { success: true, messageId: info.messageId, provider: account.name };
    } catch (err) {
      lastError = err;
      if (account.name === 'primary') deliveryMetrics.primaryFailure += 1;
      else deliveryMetrics.fallbackFailure += 1;
      deliveryMetrics.lastError = err.message;
      deliveryMetrics.lastAt = new Date().toISOString();
      logger.warn('email_send_failed', { provider: account.name, error: err.message });
      if (account.name === 'primary' && isQuotaOrRateLimitError(err)) {
        markPrimaryQuotaHit();
        continue;
      }
      if (ordered.length > 1) continue;
    }
  }

  throw lastError || new Error('SMTP send failed');
}

/**
 * Send an Email Verification link to the user
 */
export async function sendVerificationEmail({ email, name, token }) {
  const verifyLink = `${FRONTEND_URL}/verify-email?token=${encodeURIComponent(token)}`;

  const html = renderTransactionalEmail({
    heading: 'Verify Your Email Address',
    greetingName: name || 'Valued Player',
    introHtml: 'Thank you for registering with OddsYra! Please click the button below to verify your email address and activate your welcome bonus:',
    ctaLabel: 'Verify My Email',
    ctaHref: verifyLink,
    noteHtml: 'This link will expire in 24 hours. If you did not create an OddsYra account, you can safely ignore this email.',
  });

  try {
    const info = await sendMailWithFailover({
      to: email,
      subject: 'Verify your OddsYra account',
      html,
    });

    if (!isProduction) {
      console.log(`\n📧 [EMAIL SENT] Verification Email to: ${email} via ${info.provider}`);
      console.log(`🔗 [VERIFY LINK]: ${verifyLink}\n`);
    }
    return { success: true, messageId: info.messageId, provider: info.provider, ...(isProduction ? {} : { verifyLink }) };
  } catch (err) {
    console.error('[EmailService] Failed to send verification email:', err.message);
    return { success: false, error: err.message, verifyLink };
  }
}

/**
 * Send a Password Reset link to the user
 */
export async function sendPasswordResetEmail({ email, name, token }) {
  const resetLink = `${FRONTEND_URL}/reset-password?token=${encodeURIComponent(token)}`;

  const html = renderTransactionalEmail({
    heading: 'Reset Your Password',
    greetingName: name || 'Valued Player',
    introHtml: 'We received a request to reset the password for your OddsYra account. Click the button below to choose a new password:',
    ctaLabel: 'Reset My Password',
    ctaHref: resetLink,
    noteHtml: 'This link will expire in 60 minutes. If you did not request a password reset, your account is safe and you can ignore this email.',
  });

  try {
    const info = await sendMailWithFailover({
      to: email,
      subject: 'Reset your OddsYra password',
      html,
    });

    if (!isProduction) {
      console.log(`\n📧 [EMAIL SENT] Password Reset Email to: ${email} via ${info.provider}`);
      console.log(`🔗 [RESET LINK]: ${resetLink}\n`);
    }
    return { success: true, messageId: info.messageId, provider: info.provider, ...(isProduction ? {} : { resetLink }) };
  } catch (err) {
    console.error('[EmailService] Failed to send password reset email:', err.message);
    return { success: false, error: err.message, resetLink };
  }
}

/**
 * Send a Security Notification after password has been changed (Requirement 19)
 */
export async function sendPasswordChangedNotificationEmail({ email, name }) {
  const safeEmail = escapeHtml(email);

  const html = renderTransactionalEmail({
    heading: 'Your Password Was Changed',
    greetingName: name || 'Valued Player',
    introHtml: `This is a confirmation that the password for your OddsYra account (<strong>${safeEmail}</strong>) has been successfully changed.`,
    ctaLabel: 'Open OddsYra',
    ctaHref: FRONTEND_URL,
    extraHtml: `
          <tr>
            <td class="oy-td" style="padding:20px 24px 0;">
              <div style="background-color:#fff8e8;border:1px solid #f3c14a;border-radius:8px;padding:14px 16px;color:#8a5a00;font-size:14px;line-height:1.5;">
                <strong>Security notice:</strong> All other active browser sessions and devices have been logged out automatically for your safety.
              </div>
            </td>
          </tr>
          <tr>
            <td class="oy-td" style="padding:16px 24px 0;font-size:16px;line-height:1.55;color:#14181f;">If you made this change, no further action is needed.</td>
          </tr>
          <tr>
            <td class="oy-td" style="padding:12px 24px 0;font-size:16px;line-height:1.55;color:#b91c1c;font-weight:600;">If you did NOT change your password, contact OddsYra Support immediately to secure your account.</td>
          </tr>`,
    noteHtml: 'This is an automated security message from OddsYra.',
  });

  try {
    const info = await sendMailWithFailover({
      to: email,
      subject: 'Security Alert: Your OddsYra password was changed',
      html,
    });

    console.log(`\n📧 [EMAIL SENT] Password Changed Security Alert to: ${email} via ${info.provider}\n`);
    return { success: true, messageId: info.messageId, provider: info.provider };
  } catch (err) {
    console.error('[EmailService] Failed to send password changed notification:', err.message);
    return { success: false, error: err.message };
  }
}

