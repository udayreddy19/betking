/**
 * OddsEngineV3 — Real-Time Odds Telemetry Event Stream
 * 
 * Manages an in-memory event pub/sub and recent event buffer for live operations diagnostics:
 * Emits ODDS_PUBLISHED, ODDS_CHANGED, MARKET_SUSPENDED, MARKET_RESUMED, PROVIDER_CHANGED,
 * PROVIDER_DIVERGENCE, STALE_FEED, MODEL_DEGRADATION, PRICE_ANOMALY, TELEMETRY_FAILURE.
 */

export const EVENT_TYPES = Object.freeze({
  ODDS_PUBLISHED: 'ODDS_PUBLISHED',
  ODDS_CHANGED: 'ODDS_CHANGED',
  MARKET_SUSPENDED: 'MARKET_SUSPENDED',
  MARKET_RESUMED: 'MARKET_RESUMED',
  PROVIDER_CHANGED: 'PROVIDER_CHANGED',
  PROVIDER_DIVERGENCE: 'PROVIDER_DIVERGENCE',
  STALE_FEED: 'STALE_FEED',
  MODEL_DEGRADATION: 'MODEL_DEGRADATION',
  PRICE_ANOMALY: 'PRICE_ANOMALY',
  TELEMETRY_FAILURE: 'TELEMETRY_FAILURE',
});

const MAX_EVENT_BUFFER = 500;
const eventBuffer = [];
const subscribers = new Set();

export function emitOddsEvent(type, payload = {}) {
  const event = {
    eventId: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type: EVENT_TYPES[type] || type,
    timestamp: new Date().toISOString(),
    ...payload,
  };

  eventBuffer.push(event);
  if (eventBuffer.length > MAX_EVENT_BUFFER) {
    eventBuffer.shift();
  }

  for (const callback of subscribers) {
    try {
      callback(event);
    } catch {
      // subscriber errors never propagate
    }
  }

  return event;
}

export function subscribeToOddsEvents(callback) {
  if (typeof callback === 'function') {
    subscribers.add(callback);
    return () => subscribers.delete(callback);
  }
  return () => {};
}

export function getRecentOddsEvents(limit = 100, filterType = null) {
  let events = [...eventBuffer].reverse();
  if (filterType) {
    events = events.filter((e) => e.type === filterType);
  }
  return events.slice(0, Math.min(limit, MAX_EVENT_BUFFER));
}

export function clearOddsEventBuffer() {
  eventBuffer.length = 0;
}
