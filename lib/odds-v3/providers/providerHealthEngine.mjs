/**
 * OddsEngineV3 — Centralized Provider Health Engine
 * 
 * Tracks multi-provider health metrics, staleness, latency, and enforces
 * state transitions (HEALTHY, DEGRADED, STALE, UNAVAILABLE, INVALID, RECOVERING).
 */

export const PROVIDER_STATES = Object.freeze({
  HEALTHY: 'HEALTHY',
  DEGRADED: 'DEGRADED',
  STALE: 'STALE',
  UNAVAILABLE: 'UNAVAILABLE',
  INVALID: 'INVALID',
  RECOVERING: 'RECOVERING',
});

export const DEFAULT_HEALTH_CONFIG = Object.freeze({
  timeoutMs: Number(process.env.ODDS_PROVIDER_TIMEOUT_MS ?? 2500),
  maxStaleMs: Number(process.env.ODDS_PROVIDER_MAX_STALE_MS ?? 5000),
  recoveryTicksRequired: Number(process.env.ODDS_PROVIDER_RECOVERY_TICKS ?? 2),
  maxFailuresBeforeUnavailable: Number(process.env.ODDS_PROVIDER_MAX_FAILURES ?? 3),
});

class ProviderHealthEngine {
  constructor(config = {}) {
    this.config = { ...DEFAULT_HEALTH_CONFIG, ...config };
    this.providers = new Map();
  }

  /**
   * Initializes or fetches tracker for a provider.
   */
  getOrCreateProvider(providerName) {
    const key = String(providerName || 'unknown').toLowerCase();
    if (!this.providers.has(key)) {
      this.providers.set(key, {
        providerName: key,
        status: PROVIDER_STATES.HEALTHY,
        lastSuccessfulTickAt: Date.now(),
        lastAttemptAt: Date.now(),
        latencyMs: 0,
        tickAgeMs: 0,
        consecutiveFailures: 0,
        consecutiveHealthyTicks: 0,
        schemaValid: true,
        stateConsistent: true,
        confidenceScore: 1.0,
      });
    }
    return this.providers.get(key);
  }

  /**
   * Records a successful tick from a provider.
   */
  recordSuccess(providerName, { latencyMs = 0, feedTimestamp = Date.now(), schemaValid = true } = {}) {
    const p = this.getOrCreateProvider(providerName);
    const now = Date.now();
    p.lastAttemptAt = now;
    p.lastSuccessfulTickAt = now;
    p.latencyMs = Math.max(0, Number(latencyMs) || 0);
    p.tickAgeMs = Math.max(0, now - Number(feedTimestamp));
    p.schemaValid = Boolean(schemaValid);
    p.consecutiveFailures = 0;

    if (!p.schemaValid) {
      p.status = PROVIDER_STATES.INVALID;
      p.confidenceScore = 0.0;
      p.consecutiveHealthyTicks = 0;
      return p;
    }

    if (p.status === PROVIDER_STATES.UNAVAILABLE || p.status === PROVIDER_STATES.STALE || p.status === PROVIDER_STATES.INVALID) {
      p.status = PROVIDER_STATES.RECOVERING;
      p.consecutiveHealthyTicks = 1;
    } else if (p.status === PROVIDER_STATES.RECOVERING) {
      p.consecutiveHealthyTicks += 1;
      if (p.consecutiveHealthyTicks >= this.config.recoveryTicksRequired) {
        p.status = PROVIDER_STATES.HEALTHY;
      }
    } else if (p.latencyMs > this.config.timeoutMs) {
      p.status = PROVIDER_STATES.DEGRADED;
      p.consecutiveHealthyTicks = 0;
    } else {
      p.status = PROVIDER_STATES.HEALTHY;
      p.consecutiveHealthyTicks += 1;
    }

    p.confidenceScore = this._computeConfidence(p);
    return p;
  }

  /**
   * Records a failure or timeout from a provider.
   */
  recordFailure(providerName, { error, latencyMs = 0 } = {}) {
    const p = this.getOrCreateProvider(providerName);
    const now = Date.now();
    p.lastAttemptAt = now;
    p.latencyMs = Math.max(0, Number(latencyMs) || 0);
    p.consecutiveFailures += 1;
    p.consecutiveHealthyTicks = 0;

    if (p.consecutiveFailures >= this.config.maxFailuresBeforeUnavailable) {
      p.status = PROVIDER_STATES.UNAVAILABLE;
    } else {
      p.status = PROVIDER_STATES.DEGRADED;
    }

    p.confidenceScore = 0.0;
    return p;
  }

  /**
   * Evaluates current health state based on time elapsed since last successful tick.
   */
  evaluateHealth(providerName) {
    const p = this.getOrCreateProvider(providerName);
    const now = Date.now();
    p.tickAgeMs = Math.max(0, now - p.lastSuccessfulTickAt);

    if (p.tickAgeMs > this.config.maxStaleMs) {
      p.status = PROVIDER_STATES.STALE;
      p.confidenceScore = 0.0;
    }

    return { ...p };
  }

  /**
   * Returns snapshot of all registered providers.
   */
  getAllProviderHealth() {
    const res = {};
    for (const [name] of this.providers.entries()) {
      res[name] = this.evaluateHealth(name);
    }
    return res;
  }

  _computeConfidence(p) {
    if (p.status === PROVIDER_STATES.UNAVAILABLE || p.status === PROVIDER_STATES.INVALID || p.status === PROVIDER_STATES.STALE) {
      return 0.0;
    }
    let score = 1.0;
    if (p.status === PROVIDER_STATES.DEGRADED) score -= 0.3;
    if (p.status === PROVIDER_STATES.RECOVERING) score -= 0.2;
    if (p.latencyMs > 1000) score -= 0.1;
    return Math.max(0.1, Number(score.toFixed(2)));
  }
}

export const globalProviderHealth = new ProviderHealthEngine();
