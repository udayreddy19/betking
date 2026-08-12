import {
  createWebhookSubscription,
  dispatchWebhookEvent,
  processWebhookDeliveryQueue,
  isSafeWebhookUrl,
} from './developerPlatformEngine.mjs';

/**
 * Enterprise Webhook Engine (lib/webhookEngine.mjs)
 * Re-exports PostgreSQL-backed developerPlatformEngine functions to ensure single source of truth.
 */
export {
  createWebhookSubscription,
  dispatchWebhookEvent,
  processWebhookDeliveryQueue,
  isSafeWebhookUrl,
};

export async function registerWebhookEndpoint(targetUrl, events = ['match.updated', 'odds.updated']) {
  const app = await import('./developerPlatformEngine.mjs').then(m => m.createDeveloperApp({ userId: `system_wh_${Date.now()}`, name: 'Webhook Client' }));
  return createWebhookSubscription({ appId: app.appId, targetUrl, subscribedEvents: events });
}
