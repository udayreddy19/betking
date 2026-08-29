import { getGoogleOAuthConfig } from '../../../server/auth/googleOAuthService.js';
import { normalizeTestResult, failResult } from '../result.mjs';
import { ERROR_CODES } from '../errorCodes.mjs';

export async function testGoogleOAuth() {
  const cfg = getGoogleOAuthConfig();
  if (!cfg.enabled) {
    return failResult({
      code: ERROR_CODES.NOT_CONFIGURED,
      message: 'Google OAuth client is not configured',
      extra: { healthStatus: 'NOT_CONFIGURED', summary: { enabled: false } },
    });
  }
  return normalizeTestResult({
    success: true,
    statusCode: 200,
    responseTimeMs: 0,
    summary: {
      enabled: true,
      redirectConfigured: Boolean(cfg.redirectUri),
      note: 'Configuration check only. Client secret is never returned.',
    },
    data: {
      enabled: true,
      redirectConfigured: Boolean(cfg.redirectUri),
    },
  });
}
