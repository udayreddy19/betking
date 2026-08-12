/**
 * Provider Health & Automatic Fallback Engine
 * Tracks provider response times, consecutive failures, and freshness status.
 * Manages automated failover from Primary -> Secondary provider without breaking canonical match references.
 */

import { query } from '../db/pg.js';

const PROVIDER_STATES = new Map();

export class ProviderHealthEngine {
  constructor() {
    this.freshnessWindowMs = 15000; // 15 seconds
    this.staleWindowMs = 30000; // 30 seconds
    this.maxConsecutiveFailures = 3;
  }

  /** Initialize or fetch in-memory state for provider */
  getProviderState(providerName) {
    if (!PROVIDER_STATES.has(providerName)) {
      PROVIDER_STATES.set(providerName, {
        providerName,
        status: 'HEALTHY',
        freshnessStatus: 'FRESH',
        latencyMs: 120,
        consecutiveFailures: 0,
        lastSuccessAt: new Date().toISOString(),
        lastEventAt: new Date().toISOString(),
        lastErrorAt: null,
      });
    }
    return PROVIDER_STATES.get(providerName);
  }

  /** Record successful provider response */
  async recordSuccess(providerName, latencyMs = 120) {
    const state = this.getProviderState(providerName);
    state.consecutiveFailures = 0;
    state.latencyMs = latencyMs;
    state.lastSuccessAt = new Date().toISOString();
    state.lastEventAt = new Date().toISOString();
    state.status = 'HEALTHY';
    state.freshnessStatus = 'FRESH';

    try {
      await query(`
        INSERT INTO provider_health_logs (id, provider_name, status, latency_ms, error_count, consecutive_failures, last_success_at, last_event_at)
        VALUES ($1, $2, 'HEALTHY', $3, 0, 0, NOW(), NOW());
      `, [`ph_${providerName}_${Date.now()}`, providerName, latencyMs]);
    } catch (err) {
      // Ignore background log error
    }

    return state;
  }

  /** Record provider failure or timeout */
  async recordFailure(providerName, errorMessage = '') {
    const state = this.getProviderState(providerName);
    state.consecutiveFailures += 1;
    state.lastErrorAt = new Date().toISOString();

    if (state.consecutiveFailures >= this.maxConsecutiveFailures) {
      state.status = 'OFFLINE';
      state.freshnessStatus = 'OFFLINE';
    } else {
      state.status = 'DEGRADED';
      state.freshnessStatus = 'STALE';
    }

    try {
      await query(`
        INSERT INTO provider_health_logs (id, provider_name, status, latency_ms, error_count, consecutive_failures, last_success_at)
        VALUES ($1, $2, $3, $4, 1, $5, $6);
      `, [`ph_${providerName}_${Date.now()}`, providerName, state.status, state.latencyMs, state.consecutiveFailures, state.lastSuccessAt]);
    } catch (err) {
      // Ignore background log error
    }

    return state;
  }

  /** Evaluate provider freshness status based on timestamps */
  evaluateFreshness(providerName) {
    const state = this.getProviderState(providerName);
    const now = Date.now();
    const lastSuccessMs = new Date(state.lastSuccessAt).getTime();
    const diffMs = now - lastSuccessMs;

    if (state.consecutiveFailures >= this.maxConsecutiveFailures || diffMs > this.staleWindowMs) {
      state.freshnessStatus = 'OFFLINE';
    } else if (diffMs > this.freshnessWindowMs) {
      state.freshnessStatus = 'STALE';
    } else if (state.latencyMs > 2500) {
      state.freshnessStatus = 'WARNING';
    } else {
      state.freshnessStatus = 'FRESH';
    }

    return state.freshnessStatus;
  }

  /** Determine active operational provider with automated failover */
  getOperationalProvider(sport = 'cricket', preferredProvider = 'cricbuzz', fallbackProvider = 'espn') {
    const primaryState = this.getProviderState(preferredProvider);
    const primaryFreshness = this.evaluateFreshness(preferredProvider);

    if (primaryFreshness !== 'OFFLINE' && primaryState.status !== 'OFFLINE') {
      return { activeProvider: preferredProvider, isFallback: false, freshness: primaryFreshness };
    }

    // Fall back to secondary provider
    const fallbackState = this.getProviderState(fallbackProvider);
    const fallbackFreshness = this.evaluateFreshness(fallbackProvider);

    return {
      activeProvider: fallbackProvider,
      isFallback: true,
      fallbackReason: `Primary provider ${preferredProvider} is ${primaryFreshness}`,
      freshness: fallbackFreshness,
    };
  }
}

export const providerHealthEngine = new ProviderHealthEngine();
