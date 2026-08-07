/**
 * Enterprise Webhook Engine — BetKing Enterprise Platform (lib/webhookEngine.mjs)
 * Dispatches automated HTTP Webhook notifications for Bet Events, Settlement Events, Odds Updates, and Wallet Events.
 */

const REGISTERED_WEBHOOKS = [];

export function registerWebhookEndpoint(targetUrl, events = ['BET_PLACED', 'SETTLEMENT']) {
  const record = {
    webhookId: `wh_${Date.now()}`,
    targetUrl,
    events,
    active: true,
    created: new Date().toISOString(),
  };
  REGISTERED_WEBHOOKS.push(record);
  return record;
}
