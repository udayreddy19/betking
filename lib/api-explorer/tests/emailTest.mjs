import nodemailer from 'nodemailer';
import { getEmailDeliveryMetrics } from '../../../server/auth/emailService.js';
import { normalizeTestResult, failResult, mapThrownError } from '../result.mjs';
import { ERROR_CODES } from '../errorCodes.mjs';
import { timed, withTimeout } from '../timeout.mjs';

function smtpAccount(prefix) {
  const host = process.env[`${prefix}HOST`];
  const user = process.env[`${prefix}USER`];
  const pass = process.env[`${prefix}PASSWORD`] || process.env[`${prefix}PASS`];
  if (!host || !user || !pass) return null;
  const port = parseInt(process.env[`${prefix}PORT`] || '', 10) || 587;
  const secureEnv = process.env[`${prefix}SECURE`];
  const secure = secureEnv === 'true' || (secureEnv !== 'false' && port === 465);
  return { host, port, secure, user, pass };
}

export async function testEmailSmtp() {
  const started = Date.now();
  const metrics = getEmailDeliveryMetrics();
  if (!metrics.primaryConfigured) {
    return failResult({
      code: ERROR_CODES.NOT_CONFIGURED,
      message: 'Primary SMTP is not configured',
      extra: {
        healthStatus: 'NOT_CONFIGURED',
        summary: {
          primaryConfigured: false,
          fallbackConfigured: Boolean(metrics.fallbackConfigured),
        },
      },
    });
  }

  try {
    const account = smtpAccount('SMTP_');
    const transporter = nodemailer.createTransport({
      host: account.host,
      port: account.port,
      secure: account.secure,
      requireTLS: !account.secure,
      auth: { user: account.user, pass: account.pass },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
    });
    const { responseTimeMs, error } = await timed(() => withTimeout(transporter.verify(), 8000));
    if (error) return mapThrownError(error, responseTimeMs);

    return normalizeTestResult({
      success: true,
      statusCode: 200,
      responseTimeMs,
      summary: {
        connected: true,
        primaryConfigured: true,
        fallbackConfigured: Boolean(metrics.fallbackConfigured),
        lastProvider: metrics.lastProvider || null,
        mailSent: false,
        note: 'SMTP verify only — no message was sent.',
      },
      data: {
        connected: true,
        verify: 'OK',
        fallbackConfigured: Boolean(metrics.fallbackConfigured),
      },
    });
  } catch (err) {
    return mapThrownError(err, Date.now() - started);
  }
}

export async function testEmailFallbackConfig() {
  const metrics = getEmailDeliveryMetrics();
  const configured = Boolean(metrics.fallbackConfigured);
  if (!configured) {
    return failResult({
      code: ERROR_CODES.NOT_CONFIGURED,
      message: 'Fallback SMTP is not configured',
      extra: { healthStatus: 'NOT_CONFIGURED', summary: { fallbackConfigured: false } },
    });
  }
  return normalizeTestResult({
    success: true,
    statusCode: 200,
    responseTimeMs: 0,
    summary: {
      fallbackConfigured: true,
      monitored: Boolean(metrics.monitored),
      note: 'Configuration check only.',
    },
    data: { fallbackConfigured: true },
  });
}

