import Razorpay from 'razorpay';
import { normalizeTestResult, failResult, mapThrownError } from '../result.mjs';
import { ERROR_CODES } from '../errorCodes.mjs';
import { timed, withTimeout } from '../timeout.mjs';
import { allEnvPresent, razorpayKeyMode } from '../configStatus.mjs';

function sdkInstalled() {
  try {
    return Boolean(Razorpay);
  } catch {
    return false;
  }
}

export async function testRazorpay() {
  const started = Date.now();
  const mockPath = process.env.NODE_ENV === 'test';
  const configured = allEnvPresent(['RAZORPAY_KEY_SECRET'])
    && Boolean(process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID);
  const webhookConfigured = Boolean(process.env.RAZORPAY_WEBHOOK_SECRET);
  const mode = razorpayKeyMode();

  if (!configured) {
    return failResult({
      code: ERROR_CODES.NOT_CONFIGURED,
      message: 'Razorpay keys are not configured',
      extra: {
        healthStatus: 'NOT_CONFIGURED',
        summary: {
          sdkInstalled: sdkInstalled(),
          configured: false,
          mode: null,
          webhookConfigured,
          mockOrderPath: mockPath,
        },
      },
    });
  }

  if (mockPath) {
    return normalizeTestResult({
      success: true,
      statusCode: 200,
      responseTimeMs: Date.now() - started,
      mock: true,
      implementation: 'MOCK',
      healthStatus: 'HEALTHY',
      summary: {
        connected: true,
        sdkInstalled: true,
        configured: true,
        mode: mode || 'TEST',
        webhookConfigured,
        mockOrderPath: true,
        note: 'NODE_ENV=test uses synthetic order_test_* IDs. This is not a production Razorpay call.',
      },
      data: {
        connected: true,
        mode: mode || 'TEST',
        mockOrderPath: true,
      },
    });
  }

  try {
    const key_id = process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID;
    const key_secret = process.env.RAZORPAY_KEY_SECRET;
    const instance = new Razorpay({ key_id, key_secret });
    const { value, responseTimeMs, error } = await timed(() => withTimeout(
      instance.orders.all({ count: 1 }),
      8000,
    ));
    if (error) return mapThrownError(error, responseTimeMs);

    const count = Array.isArray(value?.items) ? value.items.length : (value?.count ?? 0);
    return normalizeTestResult({
      success: true,
      statusCode: 200,
      responseTimeMs,
      implementation: 'REAL',
      summary: {
        connected: true,
        sdkInstalled: true,
        configured: true,
        mode,
        webhookConfigured,
        mockOrderPath: false,
        listedOrderCount: count,
        note: 'Connectivity check only. No payments were created or charged.',
      },
      data: {
        connected: true,
        mode,
        listedOrderCount: count,
      },
    });
  } catch (err) {
    return mapThrownError(err, Date.now() - started);
  }
}
