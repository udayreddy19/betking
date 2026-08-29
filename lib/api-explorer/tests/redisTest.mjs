import { checkRedisHealth } from '../../../db/redis.js';
import { normalizeTestResult, failResult, mapThrownError } from '../result.mjs';
import { ERROR_CODES } from '../errorCodes.mjs';
import { timed, withTimeout } from '../timeout.mjs';
import { sanitizeErrorMessage } from '../sanitize.mjs';

export async function testRedis() {
  const started = Date.now();
  try {
    const { value, responseTimeMs, error } = await timed(() => withTimeout(checkRedisHealth(), 5000));
    if (error) return mapThrownError(error, responseTimeMs);

    const connected = Boolean(value?.connected || value?.ok);
    const mock = value?.status === 'mock_connected';
    if (!connected) {
      return failResult({
        code: ERROR_CODES.PROVIDER_UNAVAILABLE,
        message: sanitizeErrorMessage(value?.error || 'Redis is not connected'),
        responseTimeMs,
      });
    }

    return normalizeTestResult({
      success: true,
      statusCode: 200,
      responseTimeMs,
      mock,
      implementation: mock ? 'MOCK' : 'REAL',
      summary: {
        connected: true,
        latencyMs: responseTimeMs,
        ping: value?.status === 'mock_connected' ? 'MOCK' : 'PONG',
        status: value?.status || 'connected',
      },
      data: {
        connected: true,
        ping: value?.status === 'mock_connected' ? 'MOCK' : 'PONG',
      },
    });
  } catch (err) {
    return mapThrownError(err, Date.now() - started);
  }
}
