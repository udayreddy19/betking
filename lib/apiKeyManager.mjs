/**
 * Enterprise API Key Manager — BetKing Enterprise Platform (lib/apiKeyManager.mjs)
 * Manages client API keys: issuance, key rotation, revocation, per-minute rate limits, and scope enforcement.
 */

const API_KEYS_STORE = new Map();

export function issueApiKey(clientName, scopes = ['READ_ODDS', 'PLACE_BET']) {
  const key = `bk_live_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  const record = {
    key,
    clientName,
    scopes,
    rateLimitPerMin: 300,
    active: true,
    issuedAt: new Date().toISOString(),
  };
  API_KEYS_STORE.set(key, record);
  return record;
}
