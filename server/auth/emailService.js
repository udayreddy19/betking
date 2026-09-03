/**
 * Unified Enterprise Email Service — OddsYra Sportsbook & Casino
 *
 * Primary SMTP (Resend / Zoho) with automated Brevo fallback on quota/rate-limits.
 * Strict Dark-Mode Resilient Design System (Light-on-cream canvas).
 *
 * Approved Categories:
 * 1. Welcome & Email Verification
 * 2. Password Reset & Security Alerts
 * 3. KYC (Approved, Rejected, Reminder)
 * 4. Free Bets & Bonuses
 * 5. Referral Rewards
 * 6. Promotional Campaigns (with marketing opt-in verification)
 * 7. Support Lifecycle
 *
 * Disabled Categories (Handled via In-App & Browser Push):
 * - Payment emails (Deposits, Withdrawals)
 * - Betting emails (Placements, Settlements, Cashouts)
 */

import nodemailer from 'nodemailer';
import { logger } from '../../lib/logger.mjs';

const FRONTEND_URL = process.env.FRONTEND_URL || process.env.APP_URL || 'https://oddsyra.com';
const isProduction = process.env.NODE_ENV === 'production';

export function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Mailbox map — oddsyra.com
 *  no-reply@  transactional / security (FROM)
 *  promos@    marketing / campaigns (FROM)
 *  support@   player support inbox + Reply-To
 *  alerts@    ops / SLA / ticket alerts (TO)
 */
const SMTP_FROM = process.env.SMTP_FROM || 'OddsYra <no-reply@oddsyra.com>';
export const PROMOS_FROM = process.env.PROMOS_FROM || 'OddsYra Promotions <promos@oddsyra.com>';
export const PROMOS_REPLY_TO = process.env.PROMOS_REPLY_TO || 'promos@oddsyra.com';
export const SUPPORT_FROM = process.env.SUPPORT_FROM || 'OddsYra Support <support@oddsyra.com>';
export const SUPPORT_REPLY_TO = process.env.SUPPORT_REPLY_TO || 'support@oddsyra.com';
export const SUPPORT_INBOX_EMAIL = process.env.SUPPORT_INBOX_EMAIL || 'support@oddsyra.com';
export const ALERTS_FROM = process.env.ALERTS_FROM || 'OddsYra Alerts <alerts@oddsyra.com>';
export const SUPPORT_ALERT_EMAIL = process.env.SUPPORT_ALERT_EMAIL
  || process.env.ALERTS_EMAIL
  || 'alerts@oddsyra.com';
const PRIMARY_DAILY_LIMIT = Math.max(0, parseInt(process.env.SMTP_PRIMARY_DAILY_LIMIT || '0', 10) || 0);

/** Ops alert recipients: alerts@ first, then support inbox if different. */
export function resolveOpsAlertRecipients() {
  const primary = String(
    process.env.SUPPORT_ALERT_EMAIL
    || process.env.ALERTS_EMAIL
    || SUPPORT_ALERT_EMAIL
    || 'alerts@oddsyra.com',
  ).trim();
  const inbox = String(
    process.env.SUPPORT_INBOX_EMAIL || SUPPORT_INBOX_EMAIL || 'support@oddsyra.com',
  ).trim();
  const list = [primary];
  if (inbox && inbox.toLowerCase() !== primary.toLowerCase()) list.push(inbox);
  return list.filter(Boolean);
}

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
  const from = String(fromRaw || '').includes('@') ? fromRaw : 'no-reply@oddsyra.com';
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

function promosSmtpAccount() {
  const user = process.env.SMTP_PROMOS_USER || process.env.PROMOS_SMTP_USER;
  const pass = process.env.SMTP_PROMOS_PASSWORD || process.env.PROMOS_SMTP_PASSWORD || process.env.SMTP_PROMOS_PASS || process.env.PROMOS_SMTP_PASS;
  if (!user || !pass) return null;
  const primary = envAccount('SMTP_');
  const host = process.env.SMTP_PROMOS_HOST || process.env.PROMOS_SMTP_HOST || primary?.host;
  if (!host) return null;
  const port = parseInt(process.env.SMTP_PROMOS_PORT || process.env.PROMOS_SMTP_PORT || String(primary?.port || 465), 10) || 465;
  const secureEnv = process.env.SMTP_PROMOS_SECURE || process.env.PROMOS_SMTP_SECURE;
  const secure = secureEnv === 'true' || (secureEnv !== 'false' && port === 465);
  const fromRaw = process.env.SMTP_PROMOS_FROM || process.env.PROMOS_FROM || PROMOS_FROM;
  return {
    name: 'promos',
    host,
    port,
    secure,
    user,
    pass,
    from: String(fromRaw || '').includes('@') ? fromRaw : PROMOS_FROM,
  };
}

function isPromosFrom(from) {
  return String(from || '').toLowerCase().includes('promos@oddsyra.com');
}

/**
 * UNIFIED ODDSYRA EMAIL DESIGN SYSTEM
 * Light-on-cream HTML table layout designed for maximum deliverability and dark-mode resilience.
 */
function renderTransactionalEmail({
  heading,
  greetingName,
  introHtml,
  ctaLabel,
  ctaHref,
  noteHtml,
  extraHtml = '',
  isMarketing = false,
  unsubscribeHref = `${FRONTEND_URL}/profile`,
}) {
  const year = new Date().getFullYear();
  const safeHeading = escapeHtml(heading);
  const safeCta = escapeHtml(ctaLabel);

  const ctaSection = ctaLabel && ctaHref ? `
    <tr>
      <td align="center" class="oy-td" style="padding:22px 24px 12px;">
        <a href="${ctaHref}" target="_blank" style="display:inline-block;background-color:#1f8a4c;color:#ffffff !important;padding:13px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;letter-spacing:0.02em;">${safeCta}</a>
      </td>
    </tr>
    <tr>
      <td class="oy-muted oy-td" style="padding:4px 24px 0;font-size:12px;line-height:1.4;color:#5c6570;">Or copy and paste this link in your browser:</td>
    </tr>
    <tr>
      <td class="oy-td" style="padding:8px 24px 0;">
        <div style="background-color:#f6f2ea;border:1px dashed #1f8a4c;border-radius:8px;padding:10px 12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.45;word-break:break-all;overflow-wrap:anywhere;">
          <a class="oy-link" href="${ctaHref}" style="color:#166b3a;text-decoration:underline;">${escapeHtml(ctaHref)}</a>
        </div>
      </td>
    </tr>
  ` : '';

  const marketingFooter = isMarketing ? `
    <tr>
      <td class="oy-muted oy-td" style="padding:16px 24px 0;font-size:11px;line-height:1.5;color:#6b7280;text-align:center;">
        You received this email because you opted in to receive promotional updates from OddsYra.
        <br>
        <a href="${unsubscribeHref}" style="color:#166b3a;text-decoration:underline;">Manage your notification preferences</a> to unsubscribe.
      </td>
    </tr>
  ` : '';

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
            <td class="oy-td" style="padding:8px 24px 0;font-size:20px;font-weight:800;line-height:1.3;color:#14181f;">${safeHeading}</td>
          </tr>
          ${greetingName ? `
          <tr>
            <td class="oy-td" style="padding:16px 24px 0;font-size:15px;line-height:1.55;color:#14181f;">
              Hi <strong>${escapeHtml(greetingName)}</strong>,
            </td>
          </tr>` : ''}
          <tr>
            <td class="oy-td" style="padding:12px 24px 0;font-size:15px;line-height:1.55;color:#14181f;">${introHtml}</td>
          </tr>
          ${extraHtml}
          ${ctaSection}
          ${noteHtml ? `
          <tr>
            <td class="oy-muted oy-td" style="padding:20px 24px 0;font-size:13px;line-height:1.5;color:#5c6570;">${noteHtml}</td>
          </tr>` : ''}
          ${marketingFooter}
          <tr>
            <td class="oy-muted oy-td" style="padding:24px;font-size:12px;line-height:1.5;color:#5c6570;border-top:1px solid #ddd4c4;margin-top:16px;">
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
    quotaState.primaryExhaustedUntil = Date.now() + 24 * 60 * 60 * 1000;
  }
}

function markPrimaryQuotaFailure() {
  rollQuotaWindow();
  quotaState.primaryExhaustedUntil = Date.now() + 60 * 60 * 1000;
}

/**
 * Server-authoritative multi-provider mail dispatcher
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
  from = SMTP_FROM,
  replyTo,
  headers = {},
  forceFrom = false,
}) {
  if (!to) throw new Error('Recipient email is required');

  const promosAcc = isPromosFrom(from) ? promosSmtpAccount() : null;
  const primaryAccounts = configuredAccounts();
  const accounts = promosAcc
    ? [promosAcc, ...primaryAccounts.filter((a) => a.user !== promosAcc.user || a.host !== promosAcc.host)]
    : primaryAccounts;

  if (accounts.length === 0) {
    if (process.env.NODE_ENV === 'production') {
      logger.error('email_smtp_not_configured', { to, subject });
      return { success: false, error: 'SMTP is not configured in production environment', html };
    }
    const transport = createTransport(null);
    const result = await transport.sendMail({
      from,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      replyTo: replyTo || from,
      headers,
    });
    return { success: true, messageId: result.messageId, json: true, html };
  }

  let lastErr = null;
  const skipPrimary = !promosAcc && shouldSkipPrimary();

  for (const account of accounts) {
    if (account.name === 'primary' && skipPrimary && accounts.length > 1) {
      continue;
    }

    try {
      const transport = createTransport(account);
      const mailOptions = {
        from: forceFrom ? from : (account.from || from),
        to,
        subject,
        html,
        text: text || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
        replyTo: replyTo || (forceFrom ? from : (account.from || from)),
        headers,
      };

      const info = await transport.sendMail(mailOptions);

      if (account.name === 'primary') {
        markPrimarySuccess();
        deliveryMetrics.primarySuccess += 1;
      } else if (account.name === 'fallback') {
        deliveryMetrics.fallbackSuccess += 1;
      }

      deliveryMetrics.lastProvider = account.name;
      deliveryMetrics.lastAt = new Date().toISOString();
      deliveryMetrics.lastError = null;

      return { success: true, messageId: info.messageId, provider: account.name, html };
    } catch (err) {
      lastErr = err;
      if (account.name === 'primary') {
        deliveryMetrics.primaryFailure += 1;
        if (isQuotaOrRateLimitError(err)) {
          markPrimaryQuotaFailure();
        }
      } else if (account.name === 'fallback') {
        deliveryMetrics.fallbackFailure += 1;
      }
      deliveryMetrics.lastError = err.message;
      deliveryMetrics.lastAt = new Date().toISOString();
    }
  }

  throw lastErr || new Error('Failed to dispatch email across available transports');
}

/* ========================================================================
 * APPROVED CATEGORY 1: WELCOME & EMAIL VERIFICATION
 * ======================================================================== */

export async function sendWelcomeEmail({ email, name }) {
  const greeting = name || email.split('@')[0];
  const subject = 'Welcome to OddsYra';
  const ctaHref = `${FRONTEND_URL}/sports`;

  const html = renderTransactionalEmail({
    heading: 'Welcome to OddsYra',
    greetingName: greeting,
    introHtml: 'Thank you for joining OddsYra. Your account has been created successfully. Explore our premium sportsbook, live cricket markets, and casino gaming with instant payouts and bank-grade security.',
    ctaLabel: 'Explore OddsYra',
    ctaHref,
    noteHtml: 'For your security, never share your password or one-time verification codes with anyone. If you need any assistance, our 24/7 support team is here to help.',
  });

  return await sendEmail({ to: email, subject, html });
}

export async function sendVerificationEmail({ email, name, token }) {
  const greeting = name || email.split('@')[0];
  const subject = 'Verify your OddsYra email address';
  const ctaHref = `${FRONTEND_URL}/verify-email?token=${encodeURIComponent(token)}`;

  const html = renderTransactionalEmail({
    heading: 'Verify Your Email Address',
    greetingName: greeting,
    introHtml: 'Thank you for registering with OddsYra. Please confirm your email address by clicking the button below to activate your account and start betting.',
    ctaLabel: 'Verify Email',
    ctaHref,
    noteHtml: 'This verification link will expire in <strong>24 hours</strong>. If you did not create an OddsYra account, you can safely ignore this email.',
  });

  return await sendEmail({ to: email, subject, html });
}

/* ========================================================================
 * APPROVED CATEGORY 2: PASSWORD RESET & SECURITY ALERTS
 * ======================================================================== */

export async function sendPasswordResetEmail({ email, name, token }) {
  const greeting = name || email.split('@')[0];
  const subject = 'Reset your OddsYra password';
  const ctaHref = `${FRONTEND_URL}/reset-password?token=${encodeURIComponent(token)}`;

  const html = renderTransactionalEmail({
    heading: 'Reset Your Password',
    greetingName: greeting,
    introHtml: 'We received a request to reset the password for your OddsYra account. Click the button below to choose a new password.',
    ctaLabel: 'Reset Password',
    ctaHref,
    noteHtml: 'This password reset link will expire in <strong>1 hour</strong>. If you did not request a password reset, please change your password immediately or contact our support team.',
  });

  return await sendEmail({ to: email, subject, html });
}

export async function sendPasswordChangedNotificationEmail({ email, name, changedAt }) {
  const greeting = name || email.split('@')[0];
  const subject = 'Your OddsYra password was changed';
  const dateStr = changedAt || new Date().toUTCString();

  const html = renderTransactionalEmail({
    heading: 'Security Alert: Password Changed',
    greetingName: greeting,
    introHtml: `This is a confirmation that the password for your OddsYra account was successfully updated on <strong>${escapeHtml(dateStr)}</strong>.`,
    noteHtml: 'If you did NOT make this change, your account may be compromised. Please contact OddsYra Support immediately at <strong>support@oddsyra.com</strong> or lock your account.',
  });

  return await sendEmail({ to: email, subject, html });
}

/* ========================================================================
 * APPROVED CATEGORY 3: KYC EMAILS
 * ======================================================================== */

export async function sendKycApprovedEmail({ email, name }) {
  const greeting = name || email.split('@')[0];
  const subject = 'Your verification is complete';
  const ctaHref = `${FRONTEND_URL}/profile`;

  const html = renderTransactionalEmail({
    heading: 'Account Verification Complete',
    greetingName: greeting,
    introHtml: 'Great news! Your identity verification (KYC) has been reviewed and successfully approved. Your account is now fully verified with unrestricted access to deposits, betting, and fast withdrawals.',
    ctaLabel: 'View My Profile',
    ctaHref,
    noteHtml: 'Thank you for helping us maintain a safe and regulated gaming environment.',
  });

  return await sendEmail({ to: email, subject, html });
}

export async function sendKycRejectedEmail({ email, name, reason }) {
  const greeting = name || email.split('@')[0];
  const subject = 'Action required for your verification';
  const ctaHref = `${FRONTEND_URL}/profile`;

  const reasonHtml = reason ? `
    <tr>
      <td class="oy-td" style="padding:10px 24px 0;">
        <div style="background-color:#fff5f5;border:1px solid #fed7d7;border-radius:8px;padding:12px;color:#c53030;font-size:14px;">
          <strong>Feedback from verification team:</strong><br>${escapeHtml(reason)}
        </div>
      </td>
    </tr>
  ` : '';

  const html = renderTransactionalEmail({
    heading: 'Action Required: Account Verification',
    greetingName: greeting,
    introHtml: 'We were unable to complete your account verification with the details provided. Please review the feedback below and upload updated identity documents.',
    extraHtml: reasonHtml,
    ctaLabel: 'Resubmit Documents',
    ctaHref,
    noteHtml: 'Please ensure that your identity document is clear, valid, and all four corners are visible. No sensitive numbers or passwords should ever be shared via email.',
  });

  return await sendEmail({ to: email, subject, html });
}

export async function sendKycReminderEmail({ email, name }) {
  const greeting = name || email.split('@')[0];
  const subject = 'Verify Your Identity - OddsYra';
  const ctaHref = `${FRONTEND_URL}/profile`;

  const html = renderTransactionalEmail({
    heading: 'Complete Your Identity Verification',
    greetingName: greeting,
    introHtml: 'Complete your one-time identity verification to unlock higher withdrawal limits, instant payouts, and exclusive loyalty rewards on OddsYra.',
    ctaLabel: 'Complete KYC Now',
    ctaHref,
    noteHtml: 'Verification takes under 2 minutes. Your documents are encrypted and protected with industry-standard bank security.',
  });

  return await sendEmail({ to: email, subject, html });
}

/* ========================================================================
 * APPROVED CATEGORY 4: FREE BETS & BONUSES
 * ======================================================================== */

export async function sendDepositFreebetEmail({
  email,
  name,
  amount,
  expiryDate,
  promoTitle = 'Deposit Free Bet Offer',
}) {
  const greeting = name || email.split('@')[0];
  const subject = 'Your Free Bet is ready 🎁';
  const ctaHref = `${FRONTEND_URL}/promotions`;

  const extraDetailsHtml = `
    <tr>
      <td class="oy-td" style="padding:12px 24px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f6f2ea;border-radius:8px;padding:14px;">
          <tr>
            <td style="font-size:14px;color:#5c6570;">Reward:</td>
            <td align="right" style="font-size:16px;font-weight:700;color:#1f8a4c;">₹${Number(amount || 500).toLocaleString('en-IN')} Free Bet</td>
          </tr>
          ${promoTitle ? `
          <tr>
            <td style="font-size:13px;color:#5c6570;padding-top:6px;">Campaign:</td>
            <td align="right" style="font-size:13px;font-weight:600;padding-top:6px;">${escapeHtml(promoTitle)}</td>
          </tr>` : ''}
          ${expiryDate ? `
          <tr>
            <td style="font-size:13px;color:#5c6570;padding-top:6px;">Valid Until:</td>
            <td align="right" style="font-size:13px;font-weight:600;padding-top:6px;">${escapeHtml(expiryDate)}</td>
          </tr>` : ''}
        </table>
      </td>
    </tr>
  `;

  const html = renderTransactionalEmail({
    heading: 'Your Free Bet Has Been Credited!',
    greetingName: greeting,
    introHtml: `Congratulations! A free bet reward has been credited to your OddsYra wallet. You can use it across any live sports, cricket, or esports markets.`,
    extraHtml: extraDetailsHtml,
    ctaLabel: 'View My Rewards',
    ctaHref,
    noteHtml: 'Terms & conditions apply. Free bet stakes are not included in returns. Winnings from free bets are credited as real withdrawable cash.',
  });

  return await sendEmail({ to: email, subject, html, from: PROMOS_FROM, replyTo: PROMOS_REPLY_TO });
}

export async function sendBonusCreditedEmail({
  email,
  name,
  bonusName = 'Loyalty Bonus',
  amount = 0,
  expiryDays = 7,
}) {
  const greeting = name || email.split('@')[0];
  const subject = 'A bonus has been added to your account';
  const ctaHref = `${FRONTEND_URL}/promotions`;

  const extraDetailsHtml = `
    <tr>
      <td class="oy-td" style="padding:12px 24px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f6f2ea;border-radius:8px;padding:14px;">
          <tr>
            <td style="font-size:14px;color:#5c6570;">Bonus Name:</td>
            <td align="right" style="font-size:14px;font-weight:700;">${escapeHtml(bonusName)}</td>
          </tr>
          <tr>
            <td style="font-size:14px;color:#5c6570;padding-top:6px;">Bonus Amount:</td>
            <td align="right" style="font-size:16px;font-weight:700;color:#1f8a4c;padding-top:6px;">₹${Number(amount).toLocaleString('en-IN')}</td>
          </tr>
          <tr>
            <td style="font-size:13px;color:#5c6570;padding-top:6px;">Validity:</td>
            <td align="right" style="font-size:13px;font-weight:600;padding-top:6px;">${expiryDays} Days</td>
          </tr>
        </table>
      </td>
    </tr>
  `;

  const html = renderTransactionalEmail({
    heading: 'Bonus Added to Your Account',
    greetingName: greeting,
    introHtml: 'We have added a bonus reward to your account! Log in to view your bonus balance and qualifying games.',
    extraHtml: extraDetailsHtml,
    ctaLabel: 'View Bonus',
    ctaHref,
    noteHtml: 'Standard wagering requirements and promotional terms apply.',
  });

  return await sendEmail({ to: email, subject, html, from: PROMOS_FROM, replyTo: PROMOS_REPLY_TO });
}

export async function sendAdminGiftEmail({
  email,
  name,
  amount = 0,
  rewardType = 'freebet',
  title,
  expiresAt = null,
}) {
  if (!email) {
    return { success: false, error: 'Recipient email is required' };
  }
  const greeting = name || String(email).split('@')[0];
  const isFreebet = String(rewardType).toLowerCase() === 'freebet';
  const kind = isFreebet ? 'Free Bet' : 'Bonus';
  const inr = `₹${Number(amount || 0).toLocaleString('en-IN')}`;
  const subject = `A gift from OddsYra: ${inr} ${kind}`;
  const ctaHref = `${FRONTEND_URL}/rewards`;
  const expiryLabel = expiresAt
    ? new Date(expiresAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })
    : null;

  const extraDetailsHtml = `
    <tr>
      <td class="oy-td" style="padding:12px 24px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f6f2ea;border-radius:8px;padding:14px;">
          <tr>
            <td style="font-size:14px;color:#5c6570;">Gift:</td>
            <td align="right" style="font-size:16px;font-weight:700;color:#1f8a4c;">${inr} ${escapeHtml(kind)}</td>
          </tr>
          ${title ? `
          <tr>
            <td style="font-size:13px;color:#5c6570;padding-top:6px;">Title:</td>
            <td align="right" style="font-size:13px;font-weight:600;padding-top:6px;">${escapeHtml(title)}</td>
          </tr>` : ''}
          ${expiryLabel ? `
          <tr>
            <td style="font-size:13px;color:#5c6570;padding-top:6px;">Use by:</td>
            <td align="right" style="font-size:13px;font-weight:600;padding-top:6px;">${escapeHtml(expiryLabel)} IST</td>
          </tr>` : ''}
        </table>
      </td>
    </tr>
  `;

  const html = renderTransactionalEmail({
    heading: `You received a ${kind} gift`,
    greetingName: greeting,
    introHtml: `OddsYra has added <strong>${inr} ${escapeHtml(kind)}</strong> to your account. It is in your wallet and on My Rewards. Place it as an exact stake on sports.`,
    extraHtml: extraDetailsHtml,
    ctaLabel: 'Open My Rewards',
    ctaHref,
    noteHtml: 'This gift is credited to your promotional balance, not cash. Free bet stakes are not returned; winnings from a winning free bet are paid as cash. Terms apply.',
  });

  return await sendEmail({ to: email, subject, html, from: PROMOS_FROM, replyTo: PROMOS_REPLY_TO });
}

/* ========================================================================
 * APPROVED CATEGORY 5: REFERRAL REWARDS
 * ======================================================================== */

export async function sendReferralRewardEmail({ email, name, amount, role = 'referred' }) {
  const greeting = name || email.split('@')[0];
  const subject = 'Your referral reward is available 🎉';
  const ctaHref = `${FRONTEND_URL}/promotions`;

  const rewardDesc = role === 'referrer'
    ? 'Your invited friend completed account verification! You have been rewarded with a free bet.'
    : 'Welcome to OddsYra! Your referral free bet reward has been credited following account verification.';

  const extraDetailsHtml = `
    <tr>
      <td class="oy-td" style="padding:12px 24px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f6f2ea;border-radius:8px;padding:14px;">
          <tr>
            <td style="font-size:14px;color:#5c6570;">Reward Credited:</td>
            <td align="right" style="font-size:16px;font-weight:700;color:#1f8a4c;">₹${Number(amount || 500).toLocaleString('en-IN')} Free Bet</td>
          </tr>
        </table>
      </td>
    </tr>
  `;

  const html = renderTransactionalEmail({
    heading: 'Your Referral Reward is Here!',
    greetingName: greeting,
    introHtml: rewardDesc,
    extraHtml: extraDetailsHtml,
    ctaLabel: 'View My Rewards',
    ctaHref,
    noteHtml: 'Keep sharing your unique referral link to earn up to ₹50,000 in monthly referral rewards!',
  });

  return await sendEmail({ to: email, subject, html });
}

/* ========================================================================
 * APPROVED CATEGORY 6: PROMOTIONAL CAMPAIGNS (MARKETING)
 * ======================================================================== */

export async function sendPromotionalCampaignEmail({
  email,
  name,
  title,
  offerBody,
  ctaLabel = 'Claim Offer',
  ctaUrl = `${FRONTEND_URL}/promotions`,
  termsUrl = `${FRONTEND_URL}/terms`,
}) {
  const greeting = name || email.split('@')[0];
  const subject = title || 'Special Promotion from OddsYra';

  const html = renderTransactionalEmail({
    heading: title || 'Special OddsYra Offer',
    greetingName: greeting,
    introHtml: escapeHtml(offerBody),
    ctaLabel,
    ctaHref: ctaUrl,
    noteHtml: `Terms and conditions apply. <a href="${termsUrl}" style="color:#166b3a;">Read promotion terms</a>.`,
    isMarketing: true,
  });

  return await sendEmail({
    to: email,
    subject,
    html,
    from: PROMOS_FROM,
    replyTo: PROMOS_REPLY_TO,
    headers: {
      'List-Unsubscribe': `<${FRONTEND_URL}/profile>`,
    },
  });
}

export async function sendPromoCodeInviteEmail({
  email,
  name,
  promoCode,
  title,
  rewardDescription,
}) {
  const greeting = name || email.split('@')[0];
  const subject = `Exclusive OddsYra Promo: ${promoCode}`;
  const ctaHref = `${FRONTEND_URL}/register?promo=${encodeURIComponent(promoCode)}`;

  const promoBoxHtml = `
    <tr>
      <td class="oy-td" style="padding:14px 24px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f6f2ea;border:2px dashed #1f8a4c;border-radius:10px;padding:16px;text-align:center;">
          <tr>
            <td style="font-size:12px;font-weight:700;color:#5c6570;letter-spacing:0.08em;text-transform:uppercase;">Your Exclusive Promo Code</td>
          </tr>
          <tr>
            <td style="font-size:24px;font-weight:900;letter-spacing:0.12em;color:#1f8a4c;padding:6px 0;">
              ${escapeHtml(promoCode)}
            </td>
          </tr>
          <tr>
            <td style="font-size:13px;color:#14181f;font-weight:600;">
              ${escapeHtml(rewardDescription || 'Special sign-up reward')}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;

  const html = renderTransactionalEmail({
    heading: title || 'You are Invited to an Exclusive Promotion',
    greetingName: greeting,
    introHtml: 'We have reserved an exclusive promotion code for your account. Use your code during signup or in your promotions wallet to claim your reward.',
    extraHtml: promoBoxHtml,
    ctaLabel: 'Claim Promo Code',
    ctaHref,
    noteHtml: 'Limited availability. Each promo code can only be claimed once per eligible user.',
    isMarketing: true,
  });

  return await sendEmail({
    to: email,
    subject,
    html,
    from: PROMOS_FROM,
    replyTo: PROMOS_REPLY_TO,
    headers: {
      'List-Unsubscribe': `<${FRONTEND_URL}/profile>`,
    },
  });
}

export async function sendTargetedDepositOfferEmail({
  email,
  name,
  offerTitle,
  campaignName,
  subject: subjectOverride,
  matchPercentage,
  freeBetPercentage,
  minDeposit,
  minimumDeposit,
  maxBonus,
  maximumFreeBet,
  promoCode,
  customBodyHtml,
  expiryDate,
  validHours = 48,
  splitParts,
  splitEach,
} = {}) {
  if (!email) {
    return { success: false, error: 'missing_email' };
  }
  const greeting = name || String(email).split('@')[0];
  const matchPct = Number(matchPercentage ?? freeBetPercentage);
  const minAmt = Number(minDeposit ?? minimumDeposit ?? 500);
  const maxAmt = Number(maxBonus ?? maximumFreeBet ?? 5000);
  const parts = Math.floor(Number(splitParts) || 1);
  const eachAmt = Number(splitEach);
  const isPack = parts > 1 && Number.isFinite(eachAmt) && eachAmt > 0;
  const packTotal = isPack ? Number((parts * eachAmt).toFixed(2)) : maxAmt;
  let hours = Number(validHours);
  if (expiryDate) {
    const ms = new Date(expiryDate).getTime() - Date.now();
    if (Number.isFinite(ms) && ms > 0) hours = Math.max(1, Math.round(ms / 3600000));
  }
  if (!Number.isFinite(hours) || hours <= 0) hours = 48;
  const title = offerTitle || campaignName || (Number.isFinite(matchPct) ? `${matchPct}% Deposit Match Offer` : 'Exclusive deposit offer');
  const subject = subjectOverride || offerTitle || (Number.isFinite(matchPct)
    ? `Exclusive ${matchPct}% Deposit Match Offer`
    : 'Exclusive deposit offer from OddsYra');
  const ctaHref = `${FRONTEND_URL}/wallet`;

  const bonusLabel = isPack
    ? `${parts} × ₹${eachAmt.toLocaleString('en-IN')}`
    : `₹${maxAmt.toLocaleString('en-IN')}`;
  const bonusSub = isPack
    ? `<tr>
            <td style="font-size:12px;color:#5c6570;padding-top:4px;">Pack total:</td>
            <td align="right" style="font-size:12px;font-weight:600;padding-top:4px;">₹${packTotal.toLocaleString('en-IN')}</td>
          </tr>`
    : '';

  const codeRow = promoCode ? `
          <tr>
            <td style="font-size:13px;color:#5c6570;padding-top:6px;">Promo code:</td>
            <td align="right" style="font-size:13px;font-weight:700;padding-top:6px;letter-spacing:0.04em;">${escapeHtml(promoCode)}</td>
          </tr>` : '';

  const detailsHtml = `
    <tr>
      <td class="oy-td" style="padding:12px 24px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f6f2ea;border-radius:8px;padding:14px;">
          <tr>
            <td style="font-size:14px;color:#5c6570;">Deposit Match:</td>
            <td align="right" style="font-size:16px;font-weight:700;color:#1f8a4c;">${Number.isFinite(matchPct) ? `${matchPct}% Match` : 'Exclusive match'}</td>
          </tr>
          <tr>
            <td style="font-size:13px;color:#5c6570;padding-top:6px;">Min Deposit:</td>
            <td align="right" style="font-size:13px;font-weight:600;padding-top:6px;">₹${minAmt.toLocaleString('en-IN')}</td>
          </tr>
          <tr>
            <td style="font-size:13px;color:#5c6570;padding-top:6px;">${isPack ? 'Free bet pack:' : 'Max Bonus:'}</td>
            <td align="right" style="font-size:13px;font-weight:700;padding-top:6px;color:#1f8a4c;">${bonusLabel}</td>
          </tr>
          ${bonusSub}
          ${codeRow}
          <tr>
            <td style="font-size:13px;color:#5c6570;padding-top:6px;">Offer Expires In:</td>
            <td align="right" style="font-size:13px;font-weight:700;color:#c98a12;padding-top:6px;">${hours} Hours</td>
          </tr>
        </table>
      </td>
    </tr>
    ${customBodyHtml ? `<tr><td class="oy-td" style="padding:12px 24px 0;font-size:14px;line-height:1.55;color:#14181f;">${customBodyHtml}</td></tr>` : ''}
  `;

  const introHtml = isPack
    ? (Number.isFinite(matchPct)
      ? `Boost your balance with an exclusive ${matchPct}% match — credited as <strong>${parts} free bets of ₹${eachAmt.toLocaleString('en-IN')}</strong> each after your next qualifying deposit.`
      : `You have an exclusive deposit offer — credited as <strong>${parts} free bets of ₹${eachAmt.toLocaleString('en-IN')}</strong> each.`)
    : (Number.isFinite(matchPct)
      ? `Boost your balance with an exclusive ${matchPct}% match on your next qualifying deposit.`
      : 'You have an exclusive deposit offer waiting on OddsYra.');

  const html = renderTransactionalEmail({
    heading: title,
    greetingName: greeting,
    introHtml,
    extraHtml: detailsHtml,
    ctaLabel: 'Deposit & Claim Bonus',
    ctaHref,
    noteHtml: isPack
      ? `Promotional terms apply. After a captured qualifying deposit you receive ${parts} separate free bets of ₹${eachAmt.toLocaleString('en-IN')} each (total ₹${packTotal.toLocaleString('en-IN')}).`
      : 'Promotional terms apply. The free bet is credited after a captured qualifying deposit.',
    isMarketing: true,
  });

  try {
    return await sendEmail({
      to: email,
      subject,
      html,
      from: PROMOS_FROM,
      replyTo: PROMOS_REPLY_TO,
      headers: {
        'List-Unsubscribe': `<${FRONTEND_URL}/profile>`,
      },
    });
  } catch (err) {
    return { success: false, error: err.message || 'send_failed', html };
  }
}

/* ========================================================================
 * APPROVED CATEGORY 7: SUPPORT EMAILS
 * ======================================================================== */

export function formatMessageForEmail(text) {
  if (!text || typeof text !== 'string') return '';
  const escaped = escapeHtml(text.trim());
  return escaped.replace(/\r?\n/g, '<br>');
}

export async function sendSupportTicketCreatedUserEmail({
  email,
  name,
  userName,
  ticketId,
  ticketNumber,
  subject: ticketSubject,
  category,
}) {
  const resolvedTicketId = ticketId || ticketNumber || 'SUPPORT';
  const greeting = userName || name || (email ? email.split('@')[0] : 'Valued Customer');
  const subject = `We've received your support request [${resolvedTicketId}]`;
  const ctaHref = `${FRONTEND_URL}/profile`;

  const extraDetailsHtml = `
    <tr>
      <td class="oy-td" style="padding:10px 24px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f6f2ea;border-radius:8px;padding:12px;">
          <tr>
            <td style="font-size:13px;color:#5c6570;">Ticket Reference:</td>
            <td align="right" style="font-size:13px;font-weight:700;">${escapeHtml(resolvedTicketId)}</td>
          </tr>
          <tr>
            <td style="font-size:13px;color:#5c6570;padding-top:6px;">Subject:</td>
            <td align="right" style="font-size:13px;font-weight:600;padding-top:6px;">${escapeHtml(ticketSubject || 'General Inquiry')}</td>
          </tr>
        </table>
      </td>
    </tr>
  `;

  const html = renderTransactionalEmail({
    heading: 'Support Request Received',
    greetingName: greeting,
    introHtml: 'We have received your support request. Our customer operations team is reviewing your ticket and will respond shortly.',
    extraHtml: extraDetailsHtml,
    ctaLabel: 'View Ticket',
    ctaHref,
    noteHtml: 'You can reply directly to your ticket in the OddsYra Help Center at any time.',
  });

  return await sendEmail({
    to: email,
    subject,
    html,
    from: SMTP_FROM,
    replyTo: SUPPORT_REPLY_TO,
  });
}

export async function sendSupportAdminReplyEmail({
  email,
  name,
  userName,
  ticketId,
  ticketNumber,
  agentReply,
  messageText,
  content,
  preview,
  replyUrl,
}) {
  const resolvedTicketId = ticketId || ticketNumber || 'SUPPORT';
  const resolvedReply = (agentReply || messageText || content || preview || '').trim();
  const greeting = userName || name || (email ? email.split('@')[0] : 'Valued Customer');

  // Strict Validation: Never send a blank/empty support reply email
  if (!resolvedReply) {
    logger.warn?.('[sendSupportAdminReplyEmail] Blocked attempt to send empty support reply email', {
      email,
      ticketId: resolvedTicketId,
    });
    return {
      success: false,
      skipped: true,
      delivered: false,
      reason: 'EMPTY_AGENT_REPLY_CONTENT',
      error: 'Agent reply content is empty.',
    };
  }

  const subject = `Update on your support request [${resolvedTicketId}]`;
  const ctaHref = replyUrl || `${FRONTEND_URL}/profile`;

  const formattedReplyHtml = formatMessageForEmail(resolvedReply);

  const replyBoxHtml = `
    <tr>
      <td class="oy-td" style="padding:12px 24px 0;">
        <div style="background-color:#f6f2ea;border-left:4px solid #1f8a4c;border-radius:6px;padding:16px;font-size:14px;line-height:1.6;color:#1e293b;white-space:pre-wrap;word-break:break-word;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          ${formattedReplyHtml}
        </div>
      </td>
    </tr>
  `;

  const html = renderTransactionalEmail({
    heading: 'New Reply from OddsYra Support',
    greetingName: greeting,
    introHtml: `A support agent has responded to your ticket <strong>${escapeHtml(resolvedTicketId)}</strong>:`,
    extraHtml: replyBoxHtml,
    ctaLabel: 'View & Reply to Support',
    ctaHref,
    noteHtml: 'Please log in to your OddsYra account to continue the conversation.',
  });

  return await sendEmail({
    to: email,
    subject,
    html,
    from: SMTP_FROM,
    replyTo: SUPPORT_REPLY_TO,
  });
}

export async function sendSupportTicketClosedEmail({
  email,
  name,
  userName,
  ticketId,
  ticketNumber,
  resolutionSummary,
}) {
  const resolvedTicketId = ticketId || ticketNumber || 'SUPPORT';
  const greeting = userName || name || (email ? email.split('@')[0] : 'Valued Customer');
  const subject = `Your support request has been resolved [${resolvedTicketId}]`;
  const ctaHref = `${FRONTEND_URL}/profile`;

  const html = renderTransactionalEmail({
    heading: 'Support Ticket Resolved',
    greetingName: greeting,
    introHtml: `Your support ticket <strong>${escapeHtml(resolvedTicketId)}</strong> has been marked as resolved and closed. If you have any further questions or if your issue persists, you can easily reopen the ticket from your profile.`,
    ctaLabel: 'View Support History',
    ctaHref,
    noteHtml: 'Thank you for choosing OddsYra. We appreciate your patience while we resolved your inquiry.',
  });

  return await sendEmail({
    to: email,
    subject,
    html,
    from: SMTP_FROM,
    replyTo: SUPPORT_REPLY_TO,
  });
}

export async function sendSupportTicketAlertEmail({
  ticketId,
  ticketNumber,
  priority,
  subject: ticketSubject,
  userId,
  userEmail,
  messagePreview,
  message,
}) {
  const resolvedTicketId = ticketId || ticketNumber || 'SUPPORT';
  const preview = messagePreview || message || '';
  const subject = `[${priority || 'NORMAL'}] Support Ticket ${resolvedTicketId}: ${String(ticketSubject || '').slice(0, 40)}`;

  const bodyHtml = `
    <p><strong>Ticket ID:</strong> ${escapeHtml(resolvedTicketId)}</p>
    <p><strong>Priority:</strong> ${escapeHtml(priority || 'NORMAL')}</p>
    <p><strong>User:</strong> ${escapeHtml(userId)} (${escapeHtml(userEmail)})</p>
    <p><strong>Subject:</strong> ${escapeHtml(ticketSubject || '')}</p>
    <p><strong>Preview:</strong></p>
    <pre style="background:#f0ede6;padding:12px;border-radius:6px;white-space:pre-wrap;">${escapeHtml(preview)}</pre>
  `;

  const html = renderTransactionalEmail({
    heading: 'New Support Ticket Alert',
    greetingName: 'Support Team',
    introHtml: bodyHtml,
    ctaLabel: 'Open Admin Desk',
    ctaHref: `${FRONTEND_URL}/admin`,
  });

  const recipients = resolveOpsAlertRecipients();
  let last = { success: false, error: 'no_recipients' };
  for (const to of recipients) {
    last = await sendEmail({
      to,
      subject,
      html,
      from: SMTP_FROM,
      replyTo: SUPPORT_REPLY_TO,
    });
  }
  return { ...last, recipients };
}

export async function sendSupportSlaReminderEmail({
  ticketId,
  priority,
  subject: ticketSubject,
  breached,
  slaDeadline,
}) {
  const recipients = resolveOpsAlertRecipients();
  const subject = breached
    ? `[SLA BREACH] Support Ticket ${ticketId}`
    : `[SLA WARNING] Support Ticket ${ticketId} nearing deadline`;

  const bodyHtml = `
    <p>Ticket <strong>${escapeHtml(ticketId)}</strong> (${escapeHtml(priority)}) is ${breached ? 'in BREACH' : 'nearing SLA deadline'}.</p>
    <p><strong>Subject:</strong> ${escapeHtml(ticketSubject)}</p>
    <p><strong>Deadline:</strong> ${escapeHtml(slaDeadline || 'Immediate')}</p>
  `;

  const html = renderTransactionalEmail({
    heading: breached ? 'SLA Breach Alert' : 'SLA Warning Alert',
    greetingName: 'Support Ops',
    introHtml: bodyHtml,
    ctaLabel: 'Review Ticket Now',
    ctaHref: `${FRONTEND_URL}/admin`,
  });

  let last = { success: false, error: 'no_recipients' };
  for (const to of recipients) {
    last = await sendEmail({
      to,
      subject,
      html,
      from: SMTP_FROM,
      replyTo: SUPPORT_REPLY_TO,
    });
  }
  return { ...last, recipients };
}

/* ========================================================================
 * DISABLED CATEGORIES (PAYMENTS & BETTING)
 * Clean policy skip stubs. In-app and push notifications remain active.
 * ======================================================================== */

export async function sendDepositCompletedEmail() {
  return { delivered: false, skipped: true, reason: 'PAYMENT_EMAILS_DISABLED_BY_POLICY' };
}

export async function sendWithdrawalStatusEmail() {
  return { delivered: false, skipped: true, reason: 'PAYMENT_EMAILS_DISABLED_BY_POLICY' };
}

/* ========================================================================
 * GENERIC / TRANSACTIONAL FALLBACK DISPATCHER
 * ======================================================================== */

export async function sendGenericNotificationEmail({ to, subject, text, html }) {
  return await sendEmail({
    to,
    subject: subject || 'OddsYra Notification',
    html: html || `<p>${escapeHtml(text || '')}</p>`,
    text: text || '',
  });
}

/* ========================================================================
 * ADMIN COMPOSE — instant templates + mailbox picker (@oddsyra.com)
 * ======================================================================== */

export const ADMIN_COMPOSE_MAILBOXES = [
  {
    id: 'no-reply',
    email: 'no-reply@oddsyra.com',
    label: 'No-reply',
    description: 'Transactional / security notices',
    from: SMTP_FROM,
    replyTo: SUPPORT_REPLY_TO,
    isMarketing: false,
  },
  {
    id: 'promos',
    email: 'promos@oddsyra.com',
    label: 'Promotions',
    description: 'Marketing and campaign emails',
    from: PROMOS_FROM,
    replyTo: PROMOS_REPLY_TO,
    isMarketing: true,
  },
  {
    id: 'support',
    email: 'support@oddsyra.com',
    label: 'Support',
    description: 'Player support replies',
    from: SUPPORT_FROM,
    replyTo: SUPPORT_REPLY_TO,
    isMarketing: false,
  },
  {
    id: 'alerts',
    email: 'alerts@oddsyra.com',
    label: 'Alerts',
    description: 'Ops / SLA notifications',
    from: ALERTS_FROM,
    replyTo: SUPPORT_ALERT_EMAIL,
    isMarketing: false,
  },
];

export const ADMIN_COMPOSE_TEMPLATES = [
  {
    id: 'blank',
    name: 'Blank',
    group: 'core',
    heading: 'Message from OddsYra',
    subject: '',
    body: '',
    ctaLabel: '',
    ctaPath: '',
    mailboxId: 'no-reply',
  },
  {
    id: 'support-update',
    name: 'Support update',
    group: 'core',
    heading: 'Update on your support request',
    subject: 'Update from OddsYra Support',
    body: 'Thanks for contacting OddsYra Support.\n\nWe have reviewed your request and wanted to share a quick update.\n\nIf you still need help, reply to this email or open your ticket in the app.',
    ctaLabel: 'Open support',
    ctaPath: '/profile?tab=support',
    mailboxId: 'support',
  },
  {
    id: 'account-notice',
    name: 'Account notice',
    group: 'core',
    heading: 'Account notice',
    subject: 'Important notice about your OddsYra account',
    body: 'We are writing with an important update about your OddsYra account.\n\nPlease review the details below and take any action required.\n\nIf this does not look right, contact support immediately.',
    ctaLabel: 'View account',
    ctaPath: '/profile',
    mailboxId: 'no-reply',
  },
  {
    id: 'promo-announce',
    name: 'Promo announcement',
    group: 'core',
    heading: 'A special offer for you',
    subject: 'Exclusive offer from OddsYra',
    body: 'We have a limited-time offer waiting for you on OddsYra.\n\nClaim it before it expires — terms apply.',
    ctaLabel: 'View promotions',
    ctaPath: '/promotions',
    mailboxId: 'promos',
  },
  {
    id: 'kyc-nudge',
    name: 'KYC reminder',
    group: 'core',
    heading: 'Complete your KYC',
    subject: 'Finish KYC to unlock full OddsYra access',
    body: 'Your OddsYra account is almost ready.\n\nComplete KYC verification to unlock higher limits and withdrawals.\n\nIt only takes a few minutes.',
    ctaLabel: 'Complete KYC',
    ctaPath: '/profile?tab=kyc',
    mailboxId: 'no-reply',
  },
  {
    id: 'welcome-back',
    name: 'Welcome back',
    group: 'core',
    heading: 'Welcome back to OddsYra',
    subject: 'We saved your spot at OddsYra',
    body: 'It has been a while — markets are live and fresh offers are waiting.\n\nLog in to pick up where you left off.',
    ctaLabel: 'Open OddsYra',
    ctaPath: '/sports',
    mailboxId: 'promos',
  },
  {
    id: 'ticket-closed',
    name: 'Ticket closed',
    group: 'ops',
    heading: 'Your support ticket is resolved',
    subject: 'Your OddsYra support ticket is closed',
    body: 'We have closed your support ticket as resolved.\n\nIf anything is still outstanding, reply to this email or reopen the ticket from your profile.',
    ctaLabel: 'View ticket',
    ctaPath: '/profile?tab=support',
    mailboxId: 'support',
  },
  {
    id: 'kyc-rejected',
    name: 'KYC rejected',
    group: 'ops',
    heading: 'KYC needs another look',
    subject: 'Please resubmit your OddsYra KYC documents',
    body: 'We could not verify your KYC documents this time.\n\nPlease upload clear, matching ID and address documents from your profile. Withdrawals stay limited until KYC is approved.',
    ctaLabel: 'Resubmit KYC',
    ctaPath: '/profile?tab=kyc',
    mailboxId: 'no-reply',
  },
  {
    id: 'security-alert',
    name: 'Security alert',
    group: 'ops',
    heading: 'Security notice',
    subject: 'Security notice for your OddsYra account',
    body: 'We noticed a security-related change on your OddsYra account.\n\nIf this was you, no action is needed. If it was not, change your password and contact support immediately.',
    ctaLabel: 'Secure account',
    ctaPath: '/profile',
    mailboxId: 'no-reply',
  },
  {
    id: 'withdrawal-help',
    name: 'Withdrawal help',
    group: 'ops',
    heading: 'About your withdrawal',
    subject: 'Update on your OddsYra withdrawal',
    body: 'We are writing about your recent withdrawal request.\n\nPlease keep your UPI / bank details ready. If we need anything else, reply to this email and our support team will follow up.',
    ctaLabel: 'Open wallet',
    ctaPath: '/wallet',
    mailboxId: 'support',
  },
  {
    id: 'deposit-help',
    name: 'Deposit help',
    group: 'ops',
    heading: 'Need help depositing?',
    subject: 'Help with your OddsYra deposit',
    body: 'If a deposit did not show in your wallet, check the payment app first.\n\nIf the amount was deducted but not credited, reply with the UTR / reference and we will look into it.',
    ctaLabel: 'Open wallet',
    ctaPath: '/wallet',
    mailboxId: 'support',
  },
  {
    id: 'free-bet',
    name: 'Free bet',
    group: 'ops',
    heading: 'Your free bet is waiting',
    subject: 'A free bet has been added to your OddsYra account',
    body: 'A free bet is ready on your OddsYra account.\n\nOpen Sports, pick a market, and use the free bet before it expires. Stake is not returned.',
    ctaLabel: 'Use free bet',
    ctaPath: '/sports',
    mailboxId: 'promos',
  },
  {
    id: 'bonus-expiry',
    name: 'Bonus expiry',
    group: 'ops',
    heading: 'Your bonus is about to expire',
    subject: 'Your OddsYra bonus expires soon',
    body: 'A bonus or free bet on your account is close to expiry.\n\nLog in and use it before it lapses. Unused rewards cannot be restored after expiry.',
    ctaLabel: 'View rewards',
    ctaPath: '/rewards',
    mailboxId: 'promos',
  },
  {
    id: 'vip-perk',
    name: 'VIP perk',
    group: 'ops',
    heading: 'A VIP perk for you',
    subject: 'Your OddsYra VIP perk is ready',
    body: 'Thanks for playing with OddsYra — a VIP perk is waiting on your account.\n\nOpen Rewards to review the details and claim it.',
    ctaLabel: 'View VIP',
    ctaPath: '/rewards',
    mailboxId: 'promos',
  },
  {
    id: 'referral',
    name: 'Referral',
    group: 'ops',
    heading: 'Invite friends, earn rewards',
    subject: 'Share OddsYra and earn referral rewards',
    body: 'Invite friends to OddsYra with your referral link.\n\nWhen they verify, you both can earn a free bet. Open your profile to copy your code.',
    ctaLabel: 'Get referral link',
    ctaPath: '/profile',
    mailboxId: 'promos',
  },
  {
    id: 'responsible-gaming',
    name: 'Responsible gaming',
    group: 'ops',
    heading: 'Play within your limits',
    subject: 'Set limits on your OddsYra account',
    body: 'You can set deposit, loss, and session limits any time from your OddsYra profile.\n\nIf you need a break, use time-out or self-exclusion. Help is always available.',
    ctaLabel: 'Set limits',
    ctaPath: '/profile?tab=responsible-gaming',
    mailboxId: 'support',
  },
  {
    id: 'account-hold',
    name: 'Account hold',
    group: 'ops',
    heading: 'Your account needs a review',
    subject: 'Action needed on your OddsYra account',
    body: 'We have placed a temporary review on your OddsYra account.\n\nBetting or withdrawals may be limited until this is cleared. Reply to this email if you have questions.',
    ctaLabel: 'Contact support',
    ctaPath: '/profile?tab=support',
    mailboxId: 'alerts',
  },
];

function plainTextToIntroHtml(body) {
  const paragraphs = String(body || '')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return '<p style="margin:0;"> </p>';
  return paragraphs
    .map((block) => {
      const lines = escapeHtml(block).replace(/\n/g, '<br>');
      return `<p style="margin:0 0 12px;">${lines}</p>`;
    })
    .join('');
}

function parseComposeRecipients(to) {
  const list = String(to || '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const valid = [];
  const invalid = [];
  for (const addr of list) {
    if (emailRe.test(addr)) valid.push(addr);
    else invalid.push(addr);
  }
  return { valid: [...new Set(valid.map((a) => a.toLowerCase()))], invalid };
}

export function listAdminComposeMailboxes() {
  return ADMIN_COMPOSE_MAILBOXES.map(({ id, email, label, description, isMarketing }) => ({
    id,
    email,
    label,
    description,
    isMarketing,
  }));
}

export function listAdminComposeTemplates() {
  return ADMIN_COMPOSE_TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    group: t.group || 'core',
    heading: t.heading,
    subject: t.subject,
    body: t.body,
    ctaLabel: t.ctaLabel,
    ctaPath: t.ctaPath,
    mailboxId: t.mailboxId,
  }));
}

/**
 * Send a branded admin-composed email from a selected @oddsyra.com mailbox.
 */
export async function sendAdminComposeEmail({
  mailboxId,
  to,
  subject,
  body,
  heading,
  greetingName,
  ctaLabel,
  ctaHref,
}) {
  const mailbox = ADMIN_COMPOSE_MAILBOXES.find((m) => m.id === mailboxId);
  if (!mailbox) {
    const err = new Error('Unknown mailbox — choose no-reply, promos, support, or alerts');
    err.status = 400;
    err.code = 'INVALID_MAILBOX';
    throw err;
  }

  const { valid, invalid } = parseComposeRecipients(to);
  if (invalid.length) {
    const err = new Error(`Invalid recipient(s): ${invalid.join(', ')}`);
    err.status = 400;
    err.code = 'INVALID_RECIPIENT';
    throw err;
  }
  if (valid.length === 0) {
    const err = new Error('At least one recipient email is required');
    err.status = 400;
    err.code = 'MISSING_RECIPIENT';
    throw err;
  }
  if (valid.length > 25) {
    const err = new Error('Maximum 25 recipients per send');
    err.status = 400;
    err.code = 'TOO_MANY_RECIPIENTS';
    throw err;
  }

  const cleanSubject = String(subject || '').trim().slice(0, 200);
  const cleanBody = String(body || '').trim().slice(0, 12000);
  if (!cleanSubject) {
    const err = new Error('Subject is required');
    err.status = 400;
    throw err;
  }
  if (!cleanBody) {
    const err = new Error('Body is required');
    err.status = 400;
    throw err;
  }

  const safeHeading = String(heading || cleanSubject).trim().slice(0, 120) || 'Message from OddsYra';
  let resolvedCtaHref = null;
  if (ctaHref) {
    try {
      const parsed = new URL(String(ctaHref).trim());
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        resolvedCtaHref = parsed.toString();
      }
    } catch {
      resolvedCtaHref = null;
    }
  }
  const resolvedCtaLabel = ctaLabel ? String(ctaLabel).trim().slice(0, 60) : '';

  const html = renderTransactionalEmail({
    heading: safeHeading,
    greetingName: greetingName ? String(greetingName).trim().slice(0, 80) : undefined,
    introHtml: plainTextToIntroHtml(cleanBody),
    ctaLabel: resolvedCtaLabel || undefined,
    ctaHref: resolvedCtaHref || undefined,
    isMarketing: mailbox.isMarketing,
    noteHtml: mailbox.isMarketing
      ? `You can manage promotional email preferences in your <a href="${FRONTEND_URL}/profile" style="color:#166b3a;">OddsYra profile</a>.`
      : undefined,
  });

  const headers = mailbox.isMarketing
    ? { 'List-Unsubscribe': `<${FRONTEND_URL}/profile>` }
    : {};

  const results = [];
  let sent = 0;
  let failed = 0;
  for (const recipient of valid) {
    try {
      const result = await sendEmail({
        to: recipient,
        subject: cleanSubject,
        html,
        from: mailbox.from,
        replyTo: mailbox.replyTo,
        headers,
        forceFrom: true,
      });
      if (result?.success === false) {
        failed += 1;
        results.push({ to: recipient, success: false, error: result.error || 'Send failed' });
      } else {
        sent += 1;
        results.push({
          to: recipient,
          success: true,
          messageId: result.messageId,
          provider: result.provider || (result.json ? 'json' : null),
        });
      }
    } catch (err) {
      failed += 1;
      results.push({ to: recipient, success: false, error: err.message });
    }
  }

  return {
    success: failed === 0,
    mailbox: { id: mailbox.id, email: mailbox.email, label: mailbox.label },
    subject: cleanSubject,
    sent,
    failed,
    total: valid.length,
    html,
    results,
  };
}
