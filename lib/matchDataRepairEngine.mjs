/**
 * Match Data Repair Engine — Automated Data Audit & Repair
 * Detects state corruption or stale data, re-fetches canonical source, and records audit diffs.
 */

import { canonicalMatchStateEngine } from './canonicalMatchState.mjs';
import { validateMatchStateTransition, sanitizeMatchState } from './matchStateValidator.mjs';

class MatchDataRepairEngine {
  constructor() {
    this.repairLogs = [];
  }

  /** Audit a live match state and perform automated repair if required */
  auditAndRepairMatch(matchId) {
    const currentState = canonicalMatchStateEngine.getMatchState(matchId);
    if (!currentState) {
      return { repaired: false, reason: 'Match state not found' };
    }

    const validation = validateMatchStateTransition(null, currentState);
    if (validation.isValid) {
      return { repaired: false, reason: 'Match state is valid' };
    }

    const repairedState = sanitizeMatchState(currentState);
    const beforeState = { ...currentState };

    canonicalMatchStateEngine.updateMatchState(matchId, repairedState, 'data_repair_engine');

    const logEntry = {
      matchId,
      repairedAt: new Date().toISOString(),
      errorsFixed: validation.errors,
      before: beforeState,
      after: repairedState,
    };

    this.repairLogs.push(logEntry);
    return { repaired: true, log: logEntry };
  }

  getRepairHistory() {
    return this.repairLogs.slice(-100);
  }
}

export const matchDataRepairEngine = new MatchDataRepairEngine();
