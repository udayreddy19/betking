import { describe, it, expect, beforeEach } from 'vitest';
import { createDeveloperApp, generateApiKey, rotateApiKey, revokeApiKey, authenticateApiKey } from '../../lib/developerPlatformEngine.mjs';
import { query } from '../../db/pg.js';

describe('Phase 13 API Key Rotation & Immediate Revocation Tests', () => {
  const userId = `usr_rot_${Date.now()}`;
  let appId;
  let oldKeyId;
  let oldRawKey;

  beforeEach(async () => {
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT DO NOTHING;`, [userId, `${userId}@example.com`]);
    const app = await createDeveloperApp({ userId, name: 'Rotation App' });
    appId = app.appId;
    const key = await generateApiKey({ appId, scopes: ['odds:read'] });
    oldKeyId = key.keyId;
    oldRawKey = key.rawKey;
  });

  it('Rotating an API key revokes the old key immediately and returns a new raw key secret', async () => {
    // Old key works initially
    const auth1 = await authenticateApiKey(oldRawKey);
    expect(auth1.authenticated).toBe(true);

    // Rotate key
    const rotated = await rotateApiKey(oldKeyId, userId);
    expect(rotated.success).toBe(true);
    expect(rotated.oldKeyId).toBe(oldKeyId);
    expect(rotated.rawKey).toBeDefined();

    // Old key is revoked immediately
    await expect(authenticateApiKey(oldRawKey)).rejects.toThrow('API_AUTH_ERROR: API Key or Application is inactive or revoked');

    // New key works
    const auth2 = await authenticateApiKey(rotated.rawKey);
    expect(auth2.authenticated).toBe(true);
  });
});
