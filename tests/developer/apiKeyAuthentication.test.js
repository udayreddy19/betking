import { describe, it, expect, beforeEach } from 'vitest';
import { createDeveloperApp, generateApiKey, revokeApiKey, authenticateApiKey } from '../../lib/developerPlatformEngine.mjs';
import { query } from '../../db/pg.js';

describe('Phase 13 API Key Authentication Tests', () => {
  const userId = `usr_auth_test_${Date.now()}`;
  let appId;
  let rawKey;
  let keyId;

  beforeEach(async () => {
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT DO NOTHING;`, [userId, `${userId}@example.com`]);
    const app = await createDeveloperApp({ userId, name: 'Auth Test App' });
    appId = app.appId;

    const key = await generateApiKey({ appId, scopes: ['odds:read'] });
    rawKey = key.rawKey;
    keyId = key.keyId;
  });

  it('Valid API Key should authenticate successfully', async () => {
    const auth = await authenticateApiKey(rawKey, 'odds:read');
    expect(auth.authenticated).toBe(true);
    expect(auth.keyId).toBe(keyId);
  });

  it('Missing API Key should throw API_AUTH_ERROR', async () => {
    await expect(authenticateApiKey(null)).rejects.toThrow('API_AUTH_ERROR: Missing Authorization API Key');
  });

  it('Invalid API Key should throw API_AUTH_ERROR', async () => {
    await expect(authenticateApiKey('bk_live_invalidkey123')).rejects.toThrow('API_AUTH_ERROR: Invalid API Key');
  });

  it('Revoked API Key should throw API_AUTH_ERROR', async () => {
    await revokeApiKey(keyId);
    await expect(authenticateApiKey(rawKey)).rejects.toThrow('API_AUTH_ERROR: API Key or Application is inactive or revoked');
  });
});
