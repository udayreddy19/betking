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

async function sendMailWithFailover({ to, subject, html, text, replyTo }) {
  const accounts = configuredAccounts();
  if (accounts.length === 0) {
    if (isProduction) {
      throw new Error('SMTP is not configured (missing host, user, or password)');
    }
    const tx = createTransport(null);
    const info = await tx.sendMail({
      from: SMTP_FROM,
      to,
      subject,
      html,
      text,
      ...(replyTo ? { replyTo } : {}),
    });
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
        ...(replyTo ? { replyTo } : {}),
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
 * Send a Password Reset link + 6-digit code for manual entry.
 */
export async function sendPasswordResetEmail({ email, name, token }) {
  const resetLink = `${FRONTEND_URL}/reset-password?token=${encodeURIComponent(token)}`;
  const safeCode = escapeHtml(token);

  const html = renderTransactionalEmail({
    heading: 'Reset Your Password',
    greetingName: name || 'Valued Player',
    introHtml: 'We received a request to reset the password for your OddsYra account. Click the button below, or enter the 6-digit code in the app:',
    ctaLabel: 'Reset My Password',
    ctaHref: resetLink,
    extraHtml: `
          <tr>
            <td class="oy-td" style="padding:8px 24px 0;font-size:14px;line-height:1.5;color:#5c6570;text-align:center;">
              Or enter this 6-digit code on OddsYra:
            </td>
          </tr>
          <tr>
            <td class="oy-td" align="center" style="padding:12px 24px 0;">
              <div style="display:inline-block;background-color:#f0ebe3;border:1px dashed #c4b8a4;border-radius:10px;padding:16px 28px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:28px;font-weight:700;letter-spacing:0.35em;color:#14181f;">
                ${safeCode}
              </div>
            </td>
          </tr>`,
    noteHtml: 'This link and code expire in 60 minutes. If you did not request a password reset, your account is safe and you can ignore this email.',
  });

  const text = [
    `Hi ${name || 'Valued Player'},`,
    '',
    'Reset your OddsYra password using this link:',
    resetLink,
    '',
    'Or enter this 6-digit code on OddsYra (Enter Code Manually):',
    token,
    '',
    'This link and code expire in 60 minutes.',
    'If you did not request a password reset, you can ignore this email.',
  ].join('\n');

  try {
    const info = await sendMailWithFailover({
      to: email,
      subject: 'Reset your OddsYra password',
      html,
      text,
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

/**
 * Alert the support inbox when a user opens a ticket.
 * Default recipient: support@oddsyra.com (override with SUPPORT_INBOX_EMAIL).
 */
export async function sendSupportTicketAlertEmail({
  ticketNumber,
  conversationId,
  userId,
  userEmail,
  subject,
  category,
  priority,
  message,
  createdAt,
}) {
  const inbox = process.env.SUPPORT_INBOX_EMAIL || 'support@oddsyra.com';
  const ticketLabel = escapeHtml(ticketNumber || conversationId || 'New ticket');
  const safeSubject = escapeHtml(subject || 'Support request');
  const safeCategory = escapeHtml(category || 'General');
  const safePriority = escapeHtml(priority || 'NORMAL');
  const safeUserId = escapeHtml(userId || 'unknown');
  const safeUserEmail = escapeHtml(userEmail || 'n/a');
  const safeMessage = escapeHtml(String(message || '').slice(0, 2000));
  const safeCreated = escapeHtml(createdAt || new Date().toISOString());
  const adminUrl = `${FRONTEND_URL}/admin`;

  const html = renderTransactionalEmail({
    heading: `New ticket ${ticketLabel}`,
    greetingName: 'OddsYra Support',
    introHtml: `A player just opened a support ticket. Review it in Admin → Support.`,
    ctaLabel: 'Open Admin',
    ctaHref: adminUrl,
    extraHtml: `
          <tr>
            <td class="oy-td" style="padding:16px 24px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f0ebe3;border:1px solid #ddd4c4;border-radius:8px;">
                <tr><td style="padding:12px 14px;font-size:14px;color:#14181f;"><strong>Ticket</strong><br>${ticketLabel}</td></tr>
                <tr><td style="padding:0 14px 12px;font-size:14px;color:#14181f;"><strong>Subject</strong><br>${safeSubject}</td></tr>
                <tr><td style="padding:0 14px 12px;font-size:14px;color:#14181f;"><strong>Category / Priority</strong><br>${safeCategory} · ${safePriority}</td></tr>
                <tr><td style="padding:0 14px 12px;font-size:14px;color:#14181f;"><strong>User</strong><br>${safeUserEmail}<br><span style="color:#5c6570;">${safeUserId}</span></td></tr>
                <tr><td style="padding:0 14px 12px;font-size:14px;color:#14181f;"><strong>Opened</strong><br>${safeCreated}</td></tr>
                <tr><td style="padding:0 14px 14px;font-size:14px;color:#14181f;"><strong>Message</strong><br>${safeMessage || '—'}</td></tr>
              </table>
            </td>
          </tr>`,
    noteHtml: 'Automated alert from OddsYra. Reply to the player from Admin → Support.',
  });

  const text = [
    `New OddsYra support ticket: ${ticketNumber || conversationId}`,
    `Subject: ${subject || 'Support request'}`,
    `Category: ${category || 'General'} | Priority: ${priority || 'NORMAL'}`,
    `User: ${userEmail || 'n/a'} (${userId || 'unknown'})`,
    `Opened: ${createdAt || new Date().toISOString()}`,
    '',
    String(message || '').slice(0, 2000),
    '',
    `Admin: ${adminUrl}`,
  ].join('\n');

  try {
    const info = await sendMailWithFailover({
      to: inbox,
      subject: `[OddsYra Support] ${ticketNumber || 'New ticket'} — ${subject || 'Support request'}`,
      html,
      text,
      replyTo: userEmail || undefined,
    });
    return { success: true, messageId: info.messageId, provider: info.provider, to: inbox };
  } catch (err) {
    console.error('[EmailService] Failed to send support ticket alert:', err.message);
    return { success: false, error: err.message };
  }
}

function supportTicketCta() {
  return { ctaLabel: 'View my tickets', ctaHref: `${FRONTEND_URL}/profile?tab=support` };
}

/** Player confirmation when a ticket is opened. */
export async function sendSupportTicketCreatedUserEmail({
  email,
  name,
  ticketNumber,
  subject,
  category,
}) {
  if (!email) return { success: false, error: 'missing_email' };
  const ticketLabel = escapeHtml(ticketNumber || 'your ticket');
  const html = renderTransactionalEmail({
    heading: `Ticket ${ticketLabel} received`,
    greetingName: name || 'Valued Player',
    introHtml: `We received your support request${subject ? ` (<strong>${escapeHtml(subject)}</strong>)` : ''}. Our team will reply soon.`,
    ...supportTicketCta(),
    extraHtml: `
          <tr>
            <td class="oy-td" style="padding:16px 24px 0;font-size:15px;color:#14181f;">
              <strong>Ticket:</strong> ${ticketLabel}<br>
              <strong>Category:</strong> ${escapeHtml(category || 'General')}
            </td>
          </tr>`,
    noteHtml: 'You can also follow this ticket in Profile → Support on OddsYra.',
  });
  try {
    const info = await sendMailWithFailover({
      to: email,
      subject: `OddsYra Support — ticket ${ticketNumber || ''} received`.trim(),
      html,
      text: `Ticket ${ticketNumber} received. Category: ${category || 'General'}. View: ${FRONTEND_URL}/profile?tab=support`,
      replyTo: process.env.SUPPORT_INBOX_EMAIL || 'support@oddsyra.com',
    });
    return { success: true, messageId: info.messageId, provider: info.provider };
  } catch (err) {
    console.error('[EmailService] ticket created user mail:', err.message);
    return { success: false, error: err.message };
  }
}

/** Player email when support replies. */
export async function sendSupportAdminReplyEmail({
  email,
  name,
  ticketNumber,
  preview,
}) {
  if (!email) return { success: false, error: 'missing_email' };
  const ticketLabel = escapeHtml(ticketNumber || 'your ticket');
  const html = renderTransactionalEmail({
    heading: `New reply on ${ticketLabel}`,
    greetingName: name || 'Valued Player',
    introHtml: 'OddsYra Support replied to your ticket:',
    ...supportTicketCta(),
    extraHtml: `
          <tr>
            <td class="oy-td" style="padding:16px 24px 0;">
              <div style="background:#f0ebe3;border-radius:8px;padding:14px 16px;font-size:15px;color:#14181f;line-height:1.5;">
                ${escapeHtml(String(preview || '').slice(0, 800)) || 'Open OddsYra to read the full reply.'}
              </div>
            </td>
          </tr>`,
    noteHtml: 'Reply from Profile → Support. Do not share passwords or OTPs by email.',
  });
  try {
    const info = await sendMailWithFailover({
      to: email,
      subject: `OddsYra Support replied — ${ticketNumber || 'ticket'}`,
      html,
      text: `Support replied on ${ticketNumber}:\n\n${String(preview || '').slice(0, 800)}\n\n${FRONTEND_URL}/profile?tab=support`,
      replyTo: process.env.SUPPORT_INBOX_EMAIL || 'support@oddsyra.com',
    });
    return { success: true, messageId: info.messageId, provider: info.provider };
  } catch (err) {
    console.error('[EmailService] admin reply mail:', err.message);
    return { success: false, error: err.message };
  }
}

/** Player email when a ticket is closed. */
export async function sendSupportTicketClosedEmail({
  email,
  name,
  ticketNumber,
  resolutionSummary,
}) {
  if (!email) return { success: false, error: 'missing_email' };
  const ticketLabel = escapeHtml(ticketNumber || 'your ticket');
  const html = renderTransactionalEmail({
    heading: `Ticket ${ticketLabel} closed`,
    greetingName: name || 'Valued Player',
    introHtml: 'Your OddsYra support ticket has been closed.',
    ...supportTicketCta(),
    extraHtml: resolutionSummary
      ? `<tr><td class="oy-td" style="padding:16px 24px 0;font-size:15px;color:#14181f;"><strong>Summary:</strong> ${escapeHtml(String(resolutionSummary).slice(0, 500))}</td></tr>`
      : '',
    noteHtml: 'Need more help? Open a new ticket from Profile → Support or the chat widget.',
  });
  try {
    const info = await sendMailWithFailover({
      to: email,
      subject: `OddsYra Support — ticket ${ticketNumber || ''} closed`.trim(),
      html,
      text: `Ticket ${ticketNumber} closed. ${resolutionSummary || ''}\n${FRONTEND_URL}/profile?tab=support`,
      replyTo: process.env.SUPPORT_INBOX_EMAIL || 'support@oddsyra.com',
    });
    return { success: true, messageId: info.messageId, provider: info.provider };
  } catch (err) {
    console.error('[EmailService] ticket closed mail:', err.message);
    return { success: false, error: err.message };
  }
}

/** SLA reminder to support inbox. */
export async function sendSupportSlaReminderEmail({
  ticketNumber,
  conversationId,
  userEmail,
  subject,
  category,
  slaStatus,
  slaDueAt,
}) {
  const inbox = process.env.SUPPORT_INBOX_EMAIL || 'support@oddsyra.com';
  const label = escapeHtml(ticketNumber || conversationId || 'ticket');
  const html = renderTransactionalEmail({
    heading: `SLA ${escapeHtml(slaStatus || 'ALERT')} — ${label}`,
    greetingName: 'OddsYra Support',
    introHtml: `Ticket <strong>${label}</strong> needs attention (${escapeHtml(slaStatus || 'APPROACHING_SLA')}).`,
    ctaLabel: 'Open Admin',
    ctaHref: `${FRONTEND_URL}/admin`,
    extraHtml: `
          <tr>
            <td class="oy-td" style="padding:16px 24px 0;font-size:14px;color:#14181f;">
              <strong>Subject:</strong> ${escapeHtml(subject || '—')}<br>
              <strong>Category:</strong> ${escapeHtml(category || '—')}<br>
              <strong>Player:</strong> ${escapeHtml(userEmail || 'n/a')}<br>
              <strong>SLA due:</strong> ${escapeHtml(slaDueAt || '—')}
            </td>
          </tr>`,
    noteHtml: 'Automated SLA reminder from OddsYra.',
  });
  try {
    const info = await sendMailWithFailover({
      to: inbox,
      subject: `[SLA ${slaStatus || 'ALERT'}] ${ticketNumber || conversationId}`,
      html,
      text: `SLA ${slaStatus} for ${ticketNumber}. Due ${slaDueAt}. Player ${userEmail}.`,
    });
    return { success: true, messageId: info.messageId, provider: info.provider };
  } catch (err) {
    console.error('[EmailService] SLA reminder:', err.message);
    return { success: false, error: err.message };
  }
}

/** Deposit captured successfully. */
export async function sendDepositCompletedEmail({ email, name, amount, paymentId, newBalance }) {
  if (!email) return { success: false, error: 'missing_email' };
  const amt = Number(amount);
  const bal = Number(newBalance);
  const html = renderTransactionalEmail({
    heading: 'Deposit successful',
    greetingName: name || 'Valued Player',
    introHtml: `Your deposit of <strong>₹${escapeHtml(Number.isFinite(amt) ? amt.toFixed(2) : amount)}</strong> was credited to your OddsYra wallet.`,
    ctaLabel: 'Open OddsYra',
    ctaHref: FRONTEND_URL,
    extraHtml: `
          <tr>
            <td class="oy-td" style="padding:16px 24px 0;font-size:14px;color:#14181f;">
              ${paymentId ? `<strong>Reference:</strong> ${escapeHtml(paymentId)}<br>` : ''}
              ${Number.isFinite(bal) ? `<strong>New balance:</strong> ₹${escapeHtml(bal.toFixed(2))}` : ''}
            </td>
          </tr>`,
    noteHtml: 'Deposits may need wagering before withdrawal. Contact support@oddsyra.com if this looks wrong.',
  });
  try {
    const info = await sendMailWithFailover({
      to: email,
      subject: `OddsYra deposit ₹${Number.isFinite(amt) ? amt.toFixed(2) : amount} successful`,
      html,
      text: `Deposit ₹${amount} successful. Ref ${paymentId || ''}. Balance ₹${newBalance ?? ''}.`,
      replyTo: process.env.SUPPORT_INBOX_EMAIL || 'support@oddsyra.com',
    });
    return { success: true, messageId: info.messageId, provider: info.provider };
  } catch (err) {
    console.error('[EmailService] deposit mail:', err.message);
    return { success: false, error: err.message };
  }
}

/** Withdrawal approved or rejected. */
export async function sendWithdrawalStatusEmail({
  email,
  name,
  amount,
  status,
  withdrawalId,
  reason,
}) {
  if (!email) return { success: false, error: 'missing_email' };
  const approved = String(status).toUpperCase() === 'APPROVED';
  const amt = Number(amount);
  const html = renderTransactionalEmail({
    heading: approved ? 'Withdrawal approved' : 'Withdrawal update',
    greetingName: name || 'Valued Player',
    introHtml: approved
      ? `Your withdrawal of <strong>₹${escapeHtml(Number.isFinite(amt) ? amt.toFixed(2) : amount)}</strong> was approved and is being processed.`
      : `Your withdrawal of <strong>₹${escapeHtml(Number.isFinite(amt) ? amt.toFixed(2) : amount)}</strong> was not approved.`,
    ctaLabel: 'Open wallet',
    ctaHref: `${FRONTEND_URL}/profile`,
    extraHtml: `
          <tr>
            <td class="oy-td" style="padding:16px 24px 0;font-size:14px;color:#14181f;">
              ${withdrawalId ? `<strong>Reference:</strong> ${escapeHtml(withdrawalId)}<br>` : ''}
              <strong>Status:</strong> ${escapeHtml(status)}<br>
              ${reason && !approved ? `<strong>Reason:</strong> ${escapeHtml(String(reason).slice(0, 300))}` : ''}
            </td>
          </tr>`,
    noteHtml: 'Questions? Open a ticket in Profile → Support or email support@oddsyra.com.',
  });
  try {
    const info = await sendMailWithFailover({
      to: email,
      subject: approved
        ? `OddsYra withdrawal ₹${Number.isFinite(amt) ? amt.toFixed(2) : amount} approved`
        : `OddsYra withdrawal update — ${status}`,
      html,
      text: `Withdrawal ${status}: ₹${amount}. Ref ${withdrawalId || ''}. ${reason || ''}`,
      replyTo: process.env.SUPPORT_INBOX_EMAIL || 'support@oddsyra.com',
    });
    return { success: true, messageId: info.messageId, provider: info.provider };
  } catch (err) {
    console.error('[EmailService] withdrawal mail:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * KYC completion reminder — reuses existing Zoho/SMTP transactional pipeline.
 * Never includes PAN, Aadhaar, documents, or tokens.
 */
export async function sendKycReminderEmail({ email, name }) {
  if (!email) return { success: false, error: 'missing_email' };
  const kycUrl = `${FRONTEND_URL}/profile#kyc`;
  const html = renderTransactionalEmail({
    heading: 'Complete your KYC verification',
    greetingName: name || 'there',
    introHtml:
      'To continue using all available features of your OddsYra account, please complete your KYC verification.',
    ctaLabel: 'Complete KYC',
    ctaHref: kycUrl,
    extraHtml: `
          <tr>
            <td class="oy-td" style="padding:16px 24px 0;font-size:15px;color:#14181f;line-height:1.5;">
              Please log in to your account and complete the KYC verification process.
              If you have already completed KYC, you can ignore this email.
            </td>
          </tr>`,
    noteHtml: 'Need help? Open Profile → Support or email support@oddsyra.com.',
  });
  try {
    const info = await sendMailWithFailover({
      to: email,
      subject: 'Complete your KYC verification',
      html,
      text:
        `Hi ${name || 'there'},\n\n`
        + 'Please complete your KYC verification on OddsYra.\n'
        + `Open: ${kycUrl}\n\n`
        + 'If you already completed KYC, you can ignore this email.\n\n'
        + '— OddsYra Team',
      replyTo: process.env.SUPPORT_INBOX_EMAIL || 'support@oddsyra.com',
    });
    return { success: true, messageId: info.messageId, provider: info.provider };
  } catch (err) {
    console.error('[EmailService] KYC reminder mail:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Referral free-bet reward notification (Zoho/SMTP).
 */
export async function sendReferralRewardEmail({ email, name, amount, role = 'referred' }) {
  if (!email) return { success: false, error: 'missing_email' };
  const amt = Number(amount);
  const isReferrer = role === 'referrer';
  const html = renderTransactionalEmail({
    heading: isReferrer ? 'You earned a referral reward' : 'Your referral reward is ready',
    greetingName: name || 'there',
    introHtml: isReferrer
      ? `A friend you invited qualified. We've added <strong>₹${escapeHtml(Number.isFinite(amt) ? amt.toFixed(2) : amount)}</strong> free bet to your OddsYra wallet.`
      : `Welcome to OddsYra via referral. We've added <strong>₹${escapeHtml(Number.isFinite(amt) ? amt.toFixed(2) : amount)}</strong> free bet to your wallet.`,
    ctaLabel: 'Open OddsYra',
    ctaHref: FRONTEND_URL,
    noteHtml: 'Free bets follow OddsYra free-bet rules (profit only on wins).',
  });
  try {
    const info = await sendMailWithFailover({
      to: email,
      subject: isReferrer ? 'You earned a referral reward' : 'Your referral reward is ready',
      html,
      text:
        `Hi ${name || 'there'},\n\n`
        + `₹${Number.isFinite(amt) ? amt.toFixed(2) : amount} free bet credited (${isReferrer ? 'referrer' : 'referral'} reward).\n`
        + `${FRONTEND_URL}\n\n— OddsYra Team`,
      replyTo: process.env.SUPPORT_INBOX_EMAIL || 'support@oddsyra.com',
    });
    return { success: true, messageId: info.messageId, provider: info.provider };
  } catch (err) {
    console.error('[EmailService] referral reward mail:', err.message);
    return { success: false, error: err.message };
  }
}

