/**
 * Transactional Email Service — BetKing Authentication
 *
 * Sends branded HTML emails for:
 * 1. Email Verification (welcome verification link)
 * 2. Password Reset (secure reset link)
 *
 * Configurable via SMTP environment variables:
 * SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, APP_URL
 */

import nodemailer from 'nodemailer';

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
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT) || 587;
const SMTP_SECURE = process.env.SMTP_SECURE === 'true' || SMTP_PORT === 465;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASSWORD || process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || 'BetKing Security <no-reply@betking.com>';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });
  } else {
    // In dev mode without configured SMTP, use JSON transport / console logger
    transporter = nodemailer.createTransport({
      jsonTransport: true,
    });
  }

  return transporter;
}

/**
 * Send an Email Verification link to the user
 */
export async function sendVerificationEmail({ email, name, token }) {
  const verifyLink = `${FRONTEND_URL}/verify-email?token=${encodeURIComponent(token)}`;
  const displayName = escapeHtml(name || 'Valued Player');

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0d1117; color: #e6edf3; margin: 0; padding: 40px 20px; }
    .container { max-width: 560px; margin: 0 auto; background: #161b22; border-radius: 12px; padding: 36px; border: 1px solid #30363d; }
    .logo { font-size: 26px; font-weight: 800; color: #a855f7; margin-bottom: 24px; display: flex; align-items: center; gap: 8px; }
    .btn { display: inline-block; background: linear-gradient(135deg, #7c3aed, #a855f7); color: #ffffff !important; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 15px; margin: 24px 0; }
    .footer { font-size: 12px; color: #8b949e; margin-top: 32px; border-top: 1px solid #30363d; padding-top: 20px; }
    .code-box { background: #0d1117; border: 1px dashed #7c3aed; border-radius: 8px; padding: 12px; font-family: monospace; word-break: break-all; color: #c084fc; margin-top: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">👑 BetKing</div>
    <h2>Verify Your Email Address</h2>
    <p>Hi <strong>${displayName}</strong>,</p>
    <p>Thank you for registering with BetKing! Please click the button below to verify your email address and activate your welcome bonus:</p>
    
    <div style="text-align: center;">
      <a href="${verifyLink}" class="btn" target="_blank">Verify My Email</a>
    </div>

    <p style="font-size: 13px; color: #8b949e;">Or copy and paste this link in your browser:</p>
    <div class="code-box">${verifyLink}</div>

    <p style="font-size: 13px; color: #8b949e; margin-top: 20px;">This link will expire in 24 hours. If you did not create a BetKing account, you can safely ignore this email.</p>

    <div class="footer">
      © ${new Date().getFullYear()} BetKing Sportsbook & Casino. All rights reserved.
    </div>
  </div>
</body>
</html>
  `;

  try {
    const tx = getTransporter();
    const info = await tx.sendMail({
      from: SMTP_FROM,
      to: email,
      subject: 'Verify your BetKing account',
      html,
    });

    if (!isProduction) {
      console.log(`\n📧 [EMAIL SENT] Verification Email to: ${email}`);
      console.log(`🔗 [VERIFY LINK]: ${verifyLink}\n`);
    }
    return { success: true, messageId: info.messageId, ...(isProduction ? {} : { verifyLink }) };
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
  const displayName = escapeHtml(name || 'Valued Player');

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0d1117; color: #e6edf3; margin: 0; padding: 40px 20px; }
    .container { max-width: 560px; margin: 0 auto; background: #161b22; border-radius: 12px; padding: 36px; border: 1px solid #30363d; }
    .logo { font-size: 26px; font-weight: 800; color: #a855f7; margin-bottom: 24px; }
    .btn { display: inline-block; background: linear-gradient(135deg, #7c3aed, #a855f7); color: #ffffff !important; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 15px; margin: 24px 0; }
    .footer { font-size: 12px; color: #8b949e; margin-top: 32px; border-top: 1px solid #30363d; padding-top: 20px; }
    .code-box { background: #0d1117; border: 1px dashed #7c3aed; border-radius: 8px; padding: 12px; font-family: monospace; word-break: break-all; color: #c084fc; margin-top: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">👑 BetKing</div>
    <h2>Reset Your Password</h2>
    <p>Hi <strong>${displayName}</strong>,</p>
    <p>We received a request to reset the password for your BetKing account. Click the button below to choose a new password:</p>
    
    <div style="text-align: center;">
      <a href="${resetLink}" class="btn" target="_blank">Reset My Password</a>
    </div>

    <p style="font-size: 13px; color: #8b949e;">Or copy and paste this link in your browser:</p>
    <div class="code-box">${resetLink}</div>

    <p style="font-size: 13px; color: #8b949e; margin-top: 20px;">This link will expire in 60 minutes. If you did not request a password reset, your account is safe and you can ignore this email.</p>

    <div class="footer">
      © ${new Date().getFullYear()} BetKing Sportsbook & Casino. All rights reserved.
    </div>
  </div>
</body>
</html>
  `;

  try {
    const tx = getTransporter();
    const info = await tx.sendMail({
      from: SMTP_FROM,
      to: email,
      subject: 'Reset your BetKing password',
      html,
    });

    if (!isProduction) {
      console.log(`\n📧 [EMAIL SENT] Password Reset Email to: ${email}`);
      console.log(`🔗 [RESET LINK]: ${resetLink}\n`);
    }
    return { success: true, messageId: info.messageId, ...(isProduction ? {} : { resetLink }) };
  } catch (err) {
    console.error('[EmailService] Failed to send password reset email:', err.message);
    return { success: false, error: err.message, resetLink };
  }
}

/**
 * Send a Security Notification after password has been changed (Requirement 19)
 */
export async function sendPasswordChangedNotificationEmail({ email, name }) {
  const displayName = escapeHtml(name || 'Valued Player');
  const safeEmail = escapeHtml(email);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0d1117; color: #e6edf3; margin: 0; padding: 40px 20px; }
    .container { max-width: 560px; margin: 0 auto; background: #161b22; border-radius: 12px; padding: 36px; border: 1px solid #30363d; }
    .logo { font-size: 26px; font-weight: 800; color: #a855f7; margin-bottom: 24px; }
    .footer { font-size: 12px; color: #8b949e; margin-top: 32px; border-top: 1px solid #30363d; padding-top: 20px; }
    .alert-box { background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 8px; padding: 16px; color: #fbbf24; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">👑 BetKing Security</div>
    <h2>Your Password Was Changed</h2>
    <p>Hi <strong>${displayName}</strong>,</p>
    <p>This is a confirmation that the password for your BetKing account (<strong>${safeEmail}</strong>) has been successfully changed.</p>
    
    <div class="alert-box">
      ⚠️ <strong>Security Notice:</strong> All other active browser sessions and devices have been logged out automatically for your safety.
    </div>

    <p>If you made this change, no further action is needed.</p>
    <p style="color: #f85149; font-weight: 600;">If you did NOT change your password, please contact BetKing Support immediately to secure your account.</p>

    <div class="footer">
      © ${new Date().getFullYear()} BetKing Sportsbook & Casino. All rights reserved.
    </div>
  </div>
</body>
</html>
  `;

  try {
    const tx = getTransporter();
    const info = await tx.sendMail({
      from: SMTP_FROM,
      to: email,
      subject: 'Security Alert: Your BetKing password was changed',
      html,
    });

    console.log(`\n📧 [EMAIL SENT] Password Changed Security Alert to: ${email}\n`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error('[EmailService] Failed to send password changed notification:', err.message);
    return { success: false, error: err.message };
  }
}

