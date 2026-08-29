import { failResult } from '../result.mjs';
import { ERROR_CODES } from '../errorCodes.mjs';

export async function testNotConfigured(name, extra = {}) {
  return failResult({
    code: ERROR_CODES.NOT_CONFIGURED,
    message: `${name} is not configured or not wired into the live aggregator`,
    extra: {
      healthStatus: 'NOT_CONFIGURED',
      summary: {
        configured: false,
        ...extra,
      },
    },
  });
}

export async function testNotTestable(name, reason) {
  return failResult({
    code: ERROR_CODES.NOT_TESTABLE,
    message: reason || `${name} cannot be executed from API Explorer`,
    extra: {
      healthStatus: 'NOT_CONFIGURED',
      summary: { executable: false, reason },
    },
  });
}
