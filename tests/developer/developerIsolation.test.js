import { describe, it, expect, beforeEach } from 'vitest';
import { createDeveloperApp, generateApiKey, rotateApiKey, revokeApiKey } from '../../lib/developerPlatformEngine.mjs';
import { query } from '../../db/pg.js';

describe('Phase 13 Developer Application & Key Isolation Tests', () => {
  const userA = `usr_dev_a_${Date.now()}`;
  const userB = `usr_dev_b_${Date.now()}`;
  let keyIdA;

  beforeEach(async () => {
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT DO NOTHING;`, [userA, `${userA}@example.com`]);
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT DO NOTHING;`, [userB, `${userB}@example.com`]);

    const appA = await createDeveloperApp({ userId: userA, name: 'Developer A App' });
    const keyA = await generateApiKey({ appId: appA.appId, scopes: ['odds:read'] });
    keyIdA = keyA.keyId;
  });

  it('Developer B CANNOT revoke or rotate Developer A API key', async () => {
    // Attempt rotation by Developer B
    await expect(rotateApiKey(keyIdA, userB)).rejects.toThrow('KEY_NOT_FOUND_OR_UNAUTHORIZED: Unable to rotate API key');

    // Attempt revocation by Developer B
    await expect(revokeApiKey(keyIdA, userB)).rejects.toThrow('KEY_NOT_FOUND_OR_UNAUTHORIZED: Unable to revoke API key');
  });
});
