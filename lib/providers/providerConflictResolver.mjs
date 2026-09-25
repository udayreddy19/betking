/**
 * Provider conflict resolution — explicit, auditable rules.
 *
 * Prefer: freshness → health → majority → confidence → sequence.
 * Never silently pick an arbitrary provider without an audit record.
 */

import { ProviderRegistry } from './ProviderRegistry.mjs';

export const CONFLICT_SEVERITY = Object.freeze({
  NONE: 'NONE',
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
});

const _auditLog = [];

/**
 * @param {Array<{ providerId: string, state: any, timestamp?: string|number, confidence?: number, sequence?: number }>} observations
 */
export function resolveProviderConflict(observations = [], opts = {}) {
  const now = opts.now || Date.now();
  const staleMs = Number(opts.staleMs) || 30_000;
  const providers = (observations || []).map((o) => {
    const id = String(o.providerId || o.id || 'unknown');
    const ts = o.timestamp != null ? new Date(o.timestamp).getTime() : NaN;
    const ageMs = Number.isFinite(ts) ? Math.max(0, now - ts) : Infinity;
    const health = (() => {
      try {
        return ProviderRegistry.getAllProviders().find((p) => p.id === id)?.healthStatus || 'UNKNOWN';
      } catch {
        return 'UNKNOWN';
      }
    })();
    return {
      providerId: id,
      state: o.state,
      timestamp: Number.isFinite(ts) ? new Date(ts).toISOString() : null,
      ageMs,
      fresh: ageMs <= staleMs,
      confidence: Number(o.confidence) || 0.5,
      sequence: Number(o.sequence) || 0,
      health,
    };
  });

  if (!providers.length) {
    return {
      canonicalState: null,
      conflictSeverity: CONFLICT_SEVERITY.NONE,
      resolutionReason: 'NO_OBSERVATIONS',
      providers: [],
      auditId: null,
    };
  }

  const stateKey = (s) => JSON.stringify(s);
  const byState = new Map();
  for (const p of providers) {
    const k = stateKey(p.state);
    if (!byState.has(k)) byState.set(k, []);
    byState.get(k).push(p);
  }

  const uniqueStates = byState.size;
  let conflictSeverity = CONFLICT_SEVERITY.NONE;
  if (uniqueStates > 1) {
    const freshDisagree = [...byState.values()].filter((g) => g.some((p) => p.fresh)).length > 1;
    conflictSeverity = freshDisagree ? CONFLICT_SEVERITY.HIGH : CONFLICT_SEVERITY.MEDIUM;
    if (providers.some((p) => p.health === 'FAILED' || p.health === 'UNHEALTHY')) {
      conflictSeverity = CONFLICT_SEVERITY.CRITICAL;
    }
  }

  // Score candidates: majority + freshness + health + confidence + sequence
  const healthScore = { HEALTHY: 3, DEGRADED: 1, STALE: 0, UNHEALTHY: -2, FAILED: -3, DISABLED: -5, UNKNOWN: 0 };
  let best = null;
  let bestScore = -Infinity;
  let resolutionReason = 'SINGLE_PROVIDER';

  for (const [k, group] of byState) {
    const majority = group.length;
    const freshest = Math.min(...group.map((p) => p.ageMs));
    const maxConf = Math.max(...group.map((p) => p.confidence));
    const maxSeq = Math.max(...group.map((p) => p.sequence));
    const health = Math.max(...group.map((p) => healthScore[p.health] ?? 0));
    const score =
      majority * 100
      + (freshest <= staleMs ? 50 : 0)
      - Math.min(freshest, 120_000) / 1000
      + health * 10
      + maxConf * 5
      + maxSeq * 0.01;

    if (score > bestScore) {
      bestScore = score;
      best = { state: JSON.parse(k), group };
      const reasons = [];
      if (majority > 1) reasons.push('MAJORITY_AGREEMENT');
      if (freshest <= staleMs) reasons.push('FRESHNESS');
      if (health >= 3) reasons.push('PROVIDER_HEALTH');
      if (maxConf >= 0.7) reasons.push('PROVIDER_CONFIDENCE');
      if (maxSeq > 0) reasons.push('EVENT_SEQUENCE');
      resolutionReason = reasons.length ? reasons.join('+') : 'HIGHEST_COMPOSITE_SCORE';
    }
  }

  if (uniqueStates === 1) resolutionReason = 'UNANIMOUS';

  const audit = {
    auditId: `pcf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    at: new Date(now).toISOString(),
    canonicalState: best?.state ?? null,
    conflictSeverity,
    resolutionReason,
    providerStates: providers,
    uniqueStateCount: uniqueStates,
  };
  _auditLog.push(audit);
  if (_auditLog.length > 500) _auditLog.shift();

  return {
    canonicalState: audit.canonicalState,
    conflictSeverity: audit.conflictSeverity,
    resolutionReason: audit.resolutionReason,
    providers,
    providerTimestamps: providers.map((p) => ({ providerId: p.providerId, timestamp: p.timestamp, ageMs: p.ageMs })),
    providerHealth: providers.map((p) => ({ providerId: p.providerId, health: p.health })),
    auditId: audit.auditId,
  };
}

export function getRecentProviderConflictAudits(limit = 50) {
  return _auditLog.slice(-limit).reverse();
}

export function _resetProviderConflictAuditsForTests() {
  _auditLog.length = 0;
}

/**
 * Failover with hysteresis — avoid flapping between primary/secondary.
 */
export function selectProviderWithFailover({
  primaryId,
  secondaryId,
  primaryHealthy,
  secondaryHealthy,
  lastSelected = null,
  cooldownUntil = 0,
  now = Date.now(),
} = {}) {
  if (now < cooldownUntil && lastSelected) {
    return {
      selected: lastSelected,
      reason: 'COOLDOWN_HYSTERESIS',
      cooldownRemainingMs: cooldownUntil - now,
    };
  }
  if (primaryHealthy) {
    return {
      selected: primaryId,
      reason: lastSelected && lastSelected !== primaryId ? 'PRIMARY_RECOVERED' : 'PRIMARY_HEALTHY',
      cooldownMs: lastSelected && lastSelected !== primaryId ? 15_000 : 0,
    };
  }
  if (secondaryHealthy) {
    return {
      selected: secondaryId,
      reason: 'PRIMARY_STALE_SECONDARY_SELECTED',
      cooldownMs: 15_000,
    };
  }
  return {
    selected: lastSelected || primaryId,
    reason: 'NO_HEALTHY_PROVIDER_HOLD',
    cooldownMs: 30_000,
  };
}
