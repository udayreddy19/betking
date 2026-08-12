import {
  createDeveloperApp,
  generateApiKey,
  authenticateApiKey,
  revokeApiKey,
  rotateApiKey,
} from './developerPlatformEngine.mjs';

/**
 * Enterprise API Key Manager (lib/apiKeyManager.mjs)
 * Re-exports PostgreSQL-backed developerPlatformEngine functions to ensure single source of truth.
 */
export {
  createDeveloperApp,
  generateApiKey,
  authenticateApiKey,
  revokeApiKey,
  rotateApiKey,
};

export async function issueApiKey(clientName, scopes = ['sports:read', 'matches:read', 'odds:read']) {
  const app = await createDeveloperApp({ userId: `client_${Date.now()}`, name: clientName });
  const key = await generateApiKey({ appId: app.appId, scopes });
  return {
    key: key.rawKey,
    keyId: key.keyId,
    clientName,
    scopes,
    rateLimitPerMin: 100,
    active: true,
    issuedAt: new Date().toISOString(),
  };
}
