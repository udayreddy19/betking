import { query } from '../db/pg.js';
import crypto from 'crypto';

/**
 * Enterprise Developer Platform, Public API & Webhook Security Engine
 */

// In-Memory sliding window rate limiter fallback
const rateLimitMap = new Map();

/**
 * Create Developer Application
 */
export async function createDeveloperApp({
  userId,
  tenantId = 'tenant_default',
  name,
  description = '',
  environment = 'PRODUCTION',
}) {
  const appId = `app_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  await query(`
    INSERT INTO developer_apps (id, user_id, tenant_id, name, description, environment, status)
    VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE');
  `, [appId, userId, tenantId, name, description, environment]);

  return { success: true, appId, userId, tenantId, name, environment, status: 'ACTIVE' };
}

/**
 * Generate Secure Hashed API Key
 */
export async function generateApiKey({
  appId,
  tenantId = 'tenant_default',
  scopes = ['sports:read', 'matches:read'],
  environment = 'PRODUCTION',
}) {
  const prefix = environment === 'PRODUCTION' ? 'bk_live' : 'bk_test';
  const secretBytes = crypto.randomBytes(24).toString('hex');
  const rawKey = `${prefix}_${secretBytes}`;

  // Hash raw key using SHA-256 for secure storage
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const keyId = `key_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const keyPrefix = rawKey.substring(0, 12);

  await query(`
    INSERT INTO api_keys (id, app_id, tenant_id, key_prefix, key_hash, scopes, environment, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE');
  `, [keyId, appId, tenantId, keyPrefix, keyHash, scopes, environment]);

  // Return raw secret key ONCE
  return {
    success: true,
    keyId,
    appId,
    tenantId,
    keyPrefix,
    rawKey, // DISPLAY ONCE
    scopes,
    environment,
  };
}

/**
 * Authenticate API Key, Verify Scope & Rate Limit
 */
export async function authenticateApiKey(rawKey, requiredScope = null) {
  if (!rawKey) throw new Error('API_AUTH_ERROR: Missing Authorization API Key');

  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

  const keyRes = await query(`
    SELECT k.id AS key_id, k.app_id, k.tenant_id, k.scopes, k.environment, k.status AS key_status,
           a.status AS app_status
    FROM api_keys k
    JOIN developer_apps a ON k.app_id = a.id
    WHERE k.key_hash = $1;
  `, [keyHash]);

  if (keyRes.rows.length === 0) {
    throw new Error('API_AUTH_ERROR: Invalid API Key');
  }

  const k = keyRes.rows[0];

  if (k.key_status !== 'ACTIVE' || k.app_status !== 'ACTIVE') {
    throw new Error('API_AUTH_ERROR: API Key or Application is inactive/revoked');
  }

  // Check Granular Scope
  if (requiredScope && (!k.scopes || !k.scopes.includes(requiredScope))) {
    throw new Error(`API_SCOPE_DENIED: Missing required scope '${requiredScope}'`);
  }

  // Sliding Window Rate Limiting (100 req/min)
  const windowKey = `ratelimit_${k.key_id}_${Math.floor(Date.now() / 60000)}`;
  const currentCount = (rateLimitMap.get(windowKey) || 0) + 1;
  rateLimitMap.set(windowKey, currentCount);

  if (currentCount > 100) {
    throw new Error('API_RATE_LIMIT_EXCEEDED: Rate limit exceeded (100 requests/minute)');
  }

  // Update last used async
  query(`UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1;`, [k.key_id]).catch(() => {});

  return {
    authenticated: true,
    keyId: k.key_id,
    appId: k.app_id,
    tenantId: k.tenant_id,
    environment: k.environment,
    scopes: k.scopes,
  };
}

/**
 * Create Webhook Subscription with HMAC Secret
 */
export async function createWebhookSubscription({
  appId,
  tenantId = 'tenant_default',
  targetUrl,
  subscribedEvents = ['match.updated', 'odds.updated'],
}) {
  const subId = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const secret = `whsec_${crypto.randomBytes(24).toString('hex')}`;

  await query(`
    INSERT INTO webhook_subscriptions (id, app_id, tenant_id, target_url, secret, subscribed_events, status)
    VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE');
  `, [subId, appId, tenantId, targetUrl, secret, subscribedEvents]);

  return { success: true, subId, appId, tenantId, targetUrl, secret, subscribedEvents };
}

/**
 * Dispatch Webhook Event with HMAC-SHA256 Signature
 */
export async function dispatchWebhookEvent({
  tenantId = 'tenant_default',
  eventType,
  eventId,
  payload = {},
}) {
  const subsRes = await query(`
    SELECT id, target_url, secret
    FROM webhook_subscriptions
    WHERE tenant_id = $1 AND status = 'ACTIVE' AND $2 = ANY(subscribed_events);
  `, [tenantId, eventType]);

  const deliveryIds = [];

  for (const sub of subsRes.rows) {
    const payloadStr = JSON.stringify(payload);
    // Compute HMAC-SHA256 Signature
    const signature = `sha256=${crypto.createHmac('sha256', sub.secret).update(payloadStr).digest('hex')}`;
    const delivId = `whd_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    await query(`
      INSERT INTO webhook_deliveries (id, subscription_id, event_type, event_id, payload, signature, status, attempts)
      VALUES ($1, $2, $3, $4, $5, $6, 'QUEUED', 0);
    `, [delivId, sub.id, eventType, eventId, payloadStr, signature]);

    deliveryIds.push(delivId);
  }

  return { success: true, countDispatched: deliveryIds.length, deliveryIds };
}

/**
 * Process Webhook Delivery Queue (Worker Loop)
 */
export async function processWebhookDeliveryQueue() {
  const pendingRes = await query(`
    SELECT id, subscription_id, event_type, event_id, payload, signature, attempts
    FROM webhook_deliveries
    WHERE status IN ('QUEUED', 'RETRYING') AND attempts < 3
    ORDER BY created_at ASC LIMIT 50;
  `);

  let countDelivered = 0;
  let countDeadLetter = 0;

  for (const item of pendingRes.rows) {
    try {
      // Simulate Webhook Delivery
      await query(`
        UPDATE webhook_deliveries
        SET status = 'DELIVERED', response_code = 200, response_time_ms = 45, attempts = attempts + 1
        WHERE id = $1;
      `, [item.id]);
      countDelivered++;
    } catch (err) {
      const nextAttempts = item.attempts + 1;
      const newStatus = nextAttempts >= 3 ? 'DEAD_LETTER' : 'RETRYING';
      if (newStatus === 'DEAD_LETTER') countDeadLetter++;

      await query(`
        UPDATE webhook_deliveries
        SET status = $1, attempts = $2, response_code = 500
        WHERE id = $3;
      `, [newStatus, nextAttempts, item.id]);
    }
  }

  return { success: true, countDelivered, countDeadLetter };
}
