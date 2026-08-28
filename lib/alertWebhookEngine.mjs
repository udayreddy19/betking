/**
 * Outgoing Alert Webhook Dispatcher
 * 
 * Sends high-priority security, feed outage, and financial anomaly notifications
 * to external webhooks (Telegram, Discord, Slack, Generic HTTP endpoints).
 */

const WEBHOOK_CONFIG = {
  enabled: true,
  endpoints: [], // { id, name, type: 'TELEGRAM'|'DISCORD'|'SLACK'|'GENERIC', url, enabled: true, minPriority: 'HIGH' }
};

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
  return item;
}

export function listAlertWebhooks() {
  return WEBHOOK_CONFIG.endpoints;
}

export function deleteAlertWebhook(id) {
  WEBHOOK_CONFIG.endpoints = WEBHOOK_CONFIG.endpoints.filter((e) => e.id !== id);
}

/**
 * Dispatch an incident alert to all configured endpoints
 * @param {object} alert { title, message, category, priority, details }
 */
export async function dispatchAlertWebhook(alert = {}) {
  if (!WEBHOOK_CONFIG.enabled || !WEBHOOK_CONFIG.endpoints.length) return [];

  const priorityWeights = { LOW: 1, NORMAL: 2, HIGH: 3, CRITICAL: 4 };
  const alertWeight = priorityWeights[String(alert.priority || 'NORMAL').toUpperCase()] || 2;

  const results = [];

  for (const ep of WEBHOOK_CONFIG.endpoints) {
    if (!ep.enabled || !ep.url) continue;

    const minWeight = priorityWeights[ep.minPriority] || 3;
    if (alertWeight < minWeight) continue;

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
