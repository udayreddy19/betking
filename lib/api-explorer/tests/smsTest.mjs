import { isSmsConfigured, isWebPushConfigured } from '../../notificationChannels.mjs';
import { isEmailFailoverMonitored } from '../../../server/auth/emailService.js';
import { normalizeTestResult, failResult } from '../result.mjs';
import { ERROR_CODES } from '../errorCodes.mjs';

export async function testSmsDlt() {
  const configured = isSmsConfigured();
  const failoverReady = isEmailFailoverMonitored();
  if (!configured) {
    return failResult({
      code: ERROR_CODES.NOT_CONFIGURED,
      message: 'India DLT SMS is not configured',
      extra: {
        healthStatus: 'NOT_CONFIGURED',
        summary: { configured: false, emailFailoverMonitored: failoverReady, smsSent: false },
      },
    });
  }
  return normalizeTestResult({
    success: true,
    statusCode: 200,
    responseTimeMs: 0,
    summary: {
      configured: true,
      emailFailoverMonitored: failoverReady,
      smsSent: false,
      note: 'Connection/config check only. No SMS was sent.',
    },
    data: {
      configured: true,
      gatedUntilEmailFailover: !failoverReady,
    },
  });
}

export async function testWebPush() {
  const configured = isWebPushConfigured();
  if (!configured) {
    return failResult({
      code: ERROR_CODES.NOT_CONFIGURED,
      message: 'Web Push is not configured',
      extra: { healthStatus: 'NOT_CONFIGURED', summary: { configured: false } },
    });
  }
  return normalizeTestResult({
    success: true,
    statusCode: 200,
    responseTimeMs: 0,
    summary: { configured: true, pushSent: false, note: 'Configuration check only.' },
    data: { configured: true },
  });
}
