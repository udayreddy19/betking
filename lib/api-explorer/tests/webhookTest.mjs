import { normalizeTestResult, failResult } from '../result.mjs';
import { ERROR_CODES } from '../errorCodes.mjs';
import { envPresent } from '../configStatus.mjs';

export async function testRazorpayWebhookConfig() {
  const configured = envPresent('RAZORPAY_WEBHOOK_SECRET');
  if (!configured) {
    return failResult({
      code: ERROR_CODES.NOT_CONFIGURED,
      message: 'Razorpay webhook secret is not configured',
      extra: { healthStatus: 'NOT_CONFIGURED', summary: { configured: false } },
    });
  }
  return normalizeTestResult({
    success: true,
    statusCode: 200,
    responseTimeMs: 0,
    summary: {
      configured: true,
      endpoint: '/api/webhooks/razorpay',
      note: 'Secret is never returned. No webhook payload is replayed.',
    },
    data: { configured: true, endpoint: '/api/webhooks/razorpay' },
  });
}

export async function testDeveloperWebhooks() {
  try {
    const { query } = await import('../../../db/pg.js');
    let count = null;
    try {
      const res = await query('SELECT COUNT(*)::int AS n FROM webhook_subscriptions');
      count = res.rows?.[0]?.n ?? 0;
    } catch {
      count = null;
    }
    return normalizeTestResult({
      success: true,
      statusCode: 200,
      responseTimeMs: 0,
      summary: {
        subscriptionCount: count,
        note: 'Counts subscriptions only. Destination URLs are not returned.',
      },
      data: { subscriptionCount: count },
    });
  } catch (err) {
    return failResult({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Could not read webhook subscriptions',
    });
  }
}
