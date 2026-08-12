import { describe, it, expect, beforeEach } from 'vitest';
import { createDeveloperApp, generateApiKey, authenticateApiKey } from '../../lib/developerPlatformEngine.mjs';
import { query } from '../../db/pg.js';

describe('Phase 13 Rate Limiting & HTTP 429 Tests', () => {
  const userId = `usr_rl_${Date.now()}`;
  let rawKey;

  beforeEach(async () => {
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT DO NOTHING;`, [userId, `${userId}@example.com`]);
    const app = await createDeveloperApp({ userId, name: 'Rate Limit App' });
    const key = await generateApiKey({ appId: app.appId, scopes: ['odds:read'] });
    rawKey = key.rawKey;
  });

  it('Requests within 100 req/min limit succeed, 101st request throws API_RATE_LIMIT_EXCEEDED', async () => {
    // Send 100 requests
    for (let i = 0; i < 100; i++) {
      const auth = await authenticateApiKey(rawKey);
      expect(auth.authenticated).toBe(true);
    }

    // 101st request should trigger rate limit
    await expect(authenticateApiKey(rawKey)).rejects.toThrow('API_RATE_LIMIT_EXCEEDED: Rate limit exceeded (100 requests/minute)');
  });
});
