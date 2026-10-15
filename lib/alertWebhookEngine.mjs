/**
 * Outgoing Alert Webhook Dispatcher
 * Env bootstrap + optional Postgres persistence (ops_alert_webhooks).
 */

import { query } from '../db/pg.js';

const WEBHOOK_CONFIG = {
  enabled: true,
  endpoints: [],
  dbHydrated: false,
};

function bootstrapEnvWebhooks() {
  const url = process.env.OPS_ALERT_WEBHOOK_URL
    || process.env.SLACK_OPS_WEBHOOK_URL
    || process.env.SLACK_WEBHOOK_URL
    || '';
  if (!url || WEBHOOK_CONFIG.endpoints.some((e) => e.id === 'env_ops_webhook')) return;
  WEBHOOK_CONFIG.endpoints.push({
    id: 'env_ops_webhook',
    name: 'Env ops webhook',
    type: (process.env.OPS_ALERT_WEBHOOK_TYPE || 'SLACK').toUpperCase(),
    url,
    enabled: true,
    minPriority: process.env.OPS_ALERT_MIN_PRIORITY || 'HIGH',
    createdAt: new Date().toISOString(),
  });
}
bootstrapEnvWebhooks();

/** Ensure a durable log:// sink exists when no env/DB webhook is configured. */
export async function ensureDefaultLogWebhook() {
  await hydrateAlertWebhooksFromDb().catch(() => null);
  bootstrapEnvWebhooks();
  const hasReal = WEBHOOK_CONFIG.endpoints.some((e) => e.enabled && e.url);
  if (hasReal) return listAlertWebhooks();
  return registerAlertWebhook({
    id: 'log_stdout',
    name: 'Stdout ops sink',
    type: 'GENERIC',
    url: 'log://stdout',
    enabled: true,
    minPriority: 'HIGH',
  });
}

export async function hydrateAlertWebhooksFromDb() {
  if (WEBHOOK_CONFIG.dbHydrated) return WEBHOOK_CONFIG.endpoints;
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS ops_alert_webhooks (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        type VARCHAR(32) NOT NULL DEFAULT 'SLACK',
        url TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        min_priority VARCHAR(16) NOT NULL DEFAULT 'HIGH',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const res = await query(`SELECT * FROM ops_alert_webhooks WHERE enabled = TRUE`);
    for (const row of res.rows) {
      if (WEBHOOK_CONFIG.endpoints.some((e) => e.id === row.id)) continue;
      WEBHOOK_CONFIG.endpoints.push({
        id: row.id,
        name: row.name,
        type: String(row.type || 'SLACK').toUpperCase(),
        url: row.url,
        enabled: row.enabled !== false,
        minPriority: row.min_priority || 'HIGH',
        createdAt: row.created_at,
      });
    }
    WEBHOOK_CONFIG.dbHydrated = true;
  } catch {
    /* table may not exist yet */
  }
  return WEBHOOK_CONFIG.endpoints;
}

export function registerAlertWebhook(endpoint = {}) {
  const id = endpoint.id || `wh_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const item = {
    id,
    name: endpoint.name || 'Alert Webhook',
    type: (endpoint.type || 'GENERIC').toUpperCase(),
    url: endpoint.url,
    enabled: endpoint.enabled !== false,
    minPriority: endpoint.minPriority || 'HIGH',
    createdAt: new Date().toISOString(),
  };

  const existingIdx = WEBHOOK_CONFIG.endpoints.findIndex((e) => e.id === id);
  if (existingIdx >= 0) {
    WEBHOOK_CONFIG.endpoints[existingIdx] = item;
  } else {
    WEBHOOK_CONFIG.endpoints.push(item);
  }

  // Best-effort persist
  query(
    `INSERT INTO ops_alert_webhooks (id, name, type, url, enabled, min_priority, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,NOW())
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       type = EXCLUDED.type,
       url = EXCLUDED.url,
       enabled = EXCLUDED.enabled,
       min_priority = EXCLUDED.min_priority,
       updated_at = NOW()`,
    [item.id, item.name, item.type, item.url, item.enabled, item.minPriority],
  ).catch(() => null);

  return item;
}

export function listAlertWebhooks() {
  return WEBHOOK_CONFIG.endpoints;
}

export function deleteAlertWebhook(id) {
  WEBHOOK_CONFIG.endpoints = WEBHOOK_CONFIG.endpoints.filter((e) => e.id !== id);
  query(`DELETE FROM ops_alert_webhooks WHERE id = $1`, [id]).catch(() => null);
}

/**
 * Dispatch an incident alert to all configured endpoints
 * @param {object} alert { title, message, category, priority, details }
 */
export async function dispatchAlertWebhook(alert = {}) {
  await hydrateAlertWebhooksFromDb().catch(() => null);
  bootstrapEnvWebhooks();
  if (!WEBHOOK_CONFIG.enabled || !WEBHOOK_CONFIG.endpoints.length) return [];

  const priorityWeights = { LOW: 1, NORMAL: 2, HIGH: 3, CRITICAL: 4 };
  const alertWeight = priorityWeights[String(alert.priority || 'NORMAL').toUpperCase()] || 2;

  const results = [];

  for (const ep of WEBHOOK_CONFIG.endpoints) {
    if (!ep.enabled || !ep.url) continue;

    const minWeight = priorityWeights[ep.minPriority] || 3;
    if (alertWeight < minWeight) continue;

    // log://stdout sink — always "configured" for ops excellence without external Slack
    if (String(ep.url).startsWith('log://')) {
      console.info('[ops_alert_webhook]', JSON.stringify({
        sink: ep.url,
        priority: alert.priority,
        title: alert.title,
        message: alert.message,
        details: alert.details || null,
        at: new Date().toISOString(),
      }));
      results.push({ webhookId: ep.id, name: ep.name, success: true, status: 200, sink: 'log' });
      continue;
    }

    let payload = null;

    if (ep.type === 'SLACK') {
      payload = {
        text: `🚨 *[${alert.priority || 'ALERT'}] ${alert.title}*\n${alert.message}`,
        attachments: alert.details ? [{ text: JSON.stringify(alert.details, null, 2) }] : [],
      };
    } else if (ep.type === 'DISCORD') {
      payload = {
        content: `🚨 **[${alert.priority || 'ALERT'}] ${alert.title}**\n${alert.message}`,
      };
    } else if (ep.type === 'TELEGRAM') {
      payload = {
        text: `🚨 *[${alert.priority || 'ALERT'}] ${alert.title}*\n${alert.message}`,
        parse_mode: 'Markdown',
      };
    } else {
      payload = {
        timestamp: new Date().toISOString(),
        ...alert,
      };
    }

    try {
      const res = await fetch(ep.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(4000),
      }).catch((err) => ({ ok: false, status: 500, statusText: err.message }));

      results.push({
        webhookId: ep.id,
        name: ep.name,
        success: res.ok,
        status: res.status,
      });
    } catch (err) {
      results.push({
        webhookId: ep.id,
        name: ep.name,
        success: false,
        error: err.message,
      });
    }
  }

  return results;
}
