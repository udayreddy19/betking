import { describe, it, expect, beforeEach } from 'vitest';
import { createDeveloperApp, generateApiKey, authenticateApiKey } from '../../lib/developerPlatformEngine.mjs';
import { query } from '../../db/pg.js';

describe('Phase 13 Scope Enforcement & HTTP 403 Tests', () => {
  const userId = `usr_scope_${Date.now()}`;
  let rawKey;

  beforeEach(async () => {
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT DO NOTHING;`, [userId, `${userId}@example.com`]);
    const app = await createDeveloperApp({ userId, name: 'Scope App' });
    const key = await generateApiKey({ appId: app.appId, scopes: ['sports:read'] }); // Missing odds:read
    rawKey = key.rawKey;
  });

  it('Valid API Key with required scope should pass', async () => {
    const auth = await authenticateApiKey(rawKey, 'sports:read');
    expect(auth.authenticated).toBe(true);
  });

  it('Valid API Key MISSING required scope should throw API_SCOPE_DENIED (HTTP 403 equivalent)', async () => {
    await expect(authenticateApiKey(rawKey, 'odds:read')).rejects.toThrow("API_SCOPE_DENIED: Missing required scope 'odds:read'");
  });
});
