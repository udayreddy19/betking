import { consumeRateLimitSlot } from '../../server/middleware/rateLimiter.js';

const TEST_MAX = Math.max(1, parseInt(process.env.API_EXPLORER_TEST_RATE_LIMIT, 10) || 10);
const TEST_WINDOW = 60;
const REFRESH_MAX = 1;
const REFRESH_WINDOW = Math.max(5, parseInt(process.env.API_EXPLORER_REFRESH_WINDOW_SECONDS, 10) || 30);

export async function allowIndividualTest(adminId) {
  return consumeRateLimitSlot({
    key: String(adminId || 'anon'),
    windowSeconds: TEST_WINDOW,
    maxRequests: TEST_MAX,
    prefix: 'rl:api_explorer_test',
  });
}

export async function allowRefreshAll(adminId) {
  return consumeRateLimitSlot({
    key: String(adminId || 'anon'),
    windowSeconds: REFRESH_WINDOW,
    maxRequests: REFRESH_MAX,
    prefix: 'rl:api_explorer_refresh',
  });
}

export const EXPLORER_LIMITS = {
  testMaxPerMinute: TEST_MAX,
  refreshWindowSeconds: REFRESH_WINDOW,
};
