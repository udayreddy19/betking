import { getApiById } from './registry.mjs';
import { failResult } from './result.mjs';
import { ERROR_CODES } from './errorCodes.mjs';
import { sanitizeExplorerPayload } from './sanitize.mjs';
import { withTimeout } from './timeout.mjs';

async function dispatch(entry) {
  const handler = entry.handler;
  switch (handler) {
    case 'postgres': {
      const { testPostgres } = await import('./tests/postgresTest.mjs');
      return testPostgres();
    }
    case 'redis': {
      const { testRedis } = await import('./tests/redisTest.mjs');
      return testRedis();
    }
    case 'cricbuzz': {
      const { testCricbuzz } = await import('./tests/cricbuzzTest.mjs');
      return testCricbuzz();
    }
    case 'crex': {
      const { testCrex } = await import('./tests/crexTest.mjs');
      return testCrex();
    }
    case 'fancode': {
      const { testFanCode } = await import('./tests/fancodeTest.mjs');
      return testFanCode();
    }
    case 'tencric': {
      const { testTenCric } = await import('./tests/tencricTest.mjs');
      return testTenCric();
    }
    case 'espn': {
      const { testEspn } = await import('./tests/espnTest.mjs');
      return testEspn();
    }
    case 'flashscore': {
      const { testFlashscore } = await import('./tests/flashscoreTest.mjs');
      return testFlashscore();
    }
    case 'cricketguru': {
      const { testCricketGuru } = await import('./tests/cricketGuruTest.mjs');
      return testCricketGuru();
    }
    case 'cricketliveline': {
      const { testCricketLiveline } = await import('./tests/cricketLivelineTest.mjs');
      return testCricketLiveline();
    }
    case 'odds-engine-v3': {
      const { testOddsEngineV3 } = await import('./tests/oddsEngineTest.mjs');
      return testOddsEngineV3();
    }
    case 'razorpay': {
      const { testRazorpay } = await import('./tests/razorpayTest.mjs');
      return testRazorpay();
    }
    case 'smtp-primary': {
      const { testEmailSmtp } = await import('./tests/emailTest.mjs');
      return testEmailSmtp();
    }
    case 'smtp-fallback': {
      const { testEmailFallbackConfig } = await import('./tests/emailTest.mjs');
      return testEmailFallbackConfig();
    }
    case 'sms-dlt': {
      const { testSmsDlt } = await import('./tests/smsTest.mjs');
      return testSmsDlt();
    }
    case 'web-push': {
      const { testWebPush } = await import('./tests/smsTest.mjs');
      return testWebPush();
    }
    case 'google-oauth': {
      const { testGoogleOAuth } = await import('./tests/googleOAuthTest.mjs');
      return testGoogleOAuth();
    }
    case 'jwt': {
      const { testJwt } = await import('./tests/jwtTest.mjs');
      return testJwt();
    }
    case 'internal-health': {
      const { testInternalHealth } = await import('./tests/internalHealthTest.mjs');
      return testInternalHealth();
    }
    case 'internal-liveness': {
      const { testInternalLiveness } = await import('./tests/internalHealthTest.mjs');
      return testInternalLiveness();
    }
    case 'internal-readiness': {
      const { testInternalReadiness } = await import('./tests/internalHealthTest.mjs');
      return testInternalReadiness();
    }
    case 'live-scores-cache': {
      const { testLiveScoresCache } = await import('./tests/internalHealthTest.mjs');
      return testLiveScoresCache();
    }
    case 'auth-required': {
      const { testAuthRequiredEndpoint } = await import('./tests/internalHealthTest.mjs');
      return testAuthRequiredEndpoint(entry.name);
    }
    case 'kyc-internal': {
      const { testInternalKycEngine } = await import('./tests/kycTest.mjs');
      return testInternalKycEngine();
    }
    case 'kyc-vendor': {
      const { testKycVendorPlaceholder } = await import('./tests/kycTest.mjs');
      return testKycVendorPlaceholder(entry.id);
    }
    case 'razorpay-webhook': {
      const { testRazorpayWebhookConfig } = await import('./tests/webhookTest.mjs');
      return testRazorpayWebhookConfig();
    }
    case 'developer-webhooks': {
      const { testDeveloperWebhooks } = await import('./tests/webhookTest.mjs');
      return testDeveloperWebhooks();
    }
    case 'mock-sport': {
      const { testMockSportProvider } = await import('./tests/mockSportsTest.mjs');
      return testMockSportProvider(entry.sportId);
    }
    case 'iplsrl': {
      const { testIplsrl } = await import('./tests/iplsrlTest.mjs');
      return testIplsrl();
    }
    case 'not-configured': {
      const { testNotConfigured } = await import('./tests/placeholders.mjs');
      return testNotConfigured(entry.name, { unused: Boolean(entry.unused), mock: Boolean(entry.mock) });
    }
    case 'not-testable': {
      const { testNotTestable } = await import('./tests/placeholders.mjs');
      return testNotTestable(
        entry.name,
        'This endpoint can mutate production data. API Explorer only reports that it exists.',
      );
    }
    default:
      return failResult({
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'No safe test handler is registered for this API',
      });
  }
}

export async function runSafeApiTest(apiId) {
  const entry = getApiById(apiId);
  if (!entry) {
    return failResult({
      code: ERROR_CODES.UNKNOWN_API,
      message: 'Unknown API id',
      extra: { healthStatus: 'FAILED' },
    });
  }
  if (!entry.testable) {
    return failResult({
      code: ERROR_CODES.NOT_TESTABLE,
      message: 'This API has no safe test handler',
    });
  }
  try {
    const result = await withTimeout(dispatch(entry), entry.timeout || 10000);
    return {
      apiId: entry.id,
      ...sanitizeExplorerPayload(result),
    };
  } catch (err) {
    const fallback = failResult({
      code: err?.code === ERROR_CODES.TIMEOUT ? ERROR_CODES.TIMEOUT : ERROR_CODES.INTERNAL_ERROR,
      message: err?.code === ERROR_CODES.TIMEOUT ? 'Provider did not respond' : 'Internal error running safe test',
      responseTimeMs: entry.timeout || 10000,
    });
    return { apiId: entry.id, ...fallback };
  }
}
