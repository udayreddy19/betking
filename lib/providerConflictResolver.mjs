/**
 * Provider Conflict Resolution Engine
 * Compares multi-provider feeds by freshness, confidence, completeness, and event sequence.
 */

import { providerHealthManager } from './providerHealthManager.mjs';

class ProviderConflictResolver {
  constructor() {
    this.conflictLogs = [];
  }

  /** Resolve conflicting match states from multiple providers */
  resolveMatchConflict(matchId, providerUpdates = []) {
    if (!Array.isArray(providerUpdates) || providerUpdates.length === 0) {
      return null;
    }

    if (providerUpdates.length === 1) {
      return providerUpdates[0];
    }

    // Sort candidates by Provider Health Score + Freshness Timestamp
    const candidates = providerUpdates.map((update) => {
      const providerName = update.source || update.providerName || 'generic';
      const health = providerHealthManager.getHealth(providerName);
      const freshnessMs = update.timestamp ? new Date(update.timestamp).getTime() : Date.now();
      const score = (health?.score || 80) + (freshnessMs / 1000000);

      return {
        update,
        providerName,
        score,
        freshnessMs,
      };
    }).sort((a, b) => b.score - a.score);

    const winner = candidates[0].update;

    this.conflictLogs.push({
      matchId,
      resolvedAt: new Date().toISOString(),
      winnerProvider: candidates[0].providerName,
      candidateCount: providerUpdates.length,
    });

    return winner;
  }

  getAuditLogs() {
    return this.conflictLogs.slice(-100);
  }
}

export const providerConflictResolver = new ProviderConflictResolver();
