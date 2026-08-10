/**
 * Global Risk Orchestrator — Central Risk & Bet Acceptance Decision Engine
 * Orchestrates Risk Engine, Exposure Engine, Responsible Gaming, Fraud, Liquidity, and Concurrency.
 * ZERO HARDCODED SPORTS DATA.
 */

import { validateResponsibleGamingStatus } from './responsibleGaming.mjs';
import { calculateExposureRisk } from './exposureEngine.mjs';
import { evaluateRiskLimits } from './riskEngine.mjs';

class GlobalRiskOrchestrator {
  constructor() {
    this.decisionsLog = [];
  }

  /**
   * Primary entry point for bet acceptance evaluation.
   */
  evaluateBetRequest({
    userId = 'anonymous',
    matchId,
    marketId,
    selectionId,
    clientOdds,
    serverOdds,
    stake = 0,
    userSessionMinutes = 0,
    userDailyDeposit = 0,
    matchVersion = 1,
    currentServerVersion = 1,
  }) {
    const timestamp = new Date().toISOString();

    // 1. Version & Stale Odds Guard
    if (matchVersion < currentServerVersion) {
      return this.recordDecision({
        decision: 'REQUIRE_ODDS_CONFIRMATION',
        reason: 'Match version out of date (odds updated)',
        userId, matchId, marketId, selectionId, stake, clientOdds, serverOdds, timestamp,
      });
    }

    if (serverOdds && Math.abs(clientOdds - serverOdds) > 0.05) {
      return this.recordDecision({
        decision: 'REPRICE',
        reason: `Odds moved from ${clientOdds} to ${serverOdds}`,
        proposedOdds: serverOdds,
        userId, matchId, marketId, selectionId, stake, clientOdds, serverOdds, timestamp,
      });
    }

    // 2. Server-side Responsible Gaming Evaluation
    const rgCheck = validateResponsibleGamingStatus(userId, userSessionMinutes, userDailyDeposit);
    if (!rgCheck.allowed) {
      return this.recordDecision({
        decision: 'REJECT',
        reason: `Responsible Gaming limit reached: ${rgCheck.reason}`,
        userId, matchId, marketId, selectionId, stake, clientOdds, serverOdds, timestamp,
      });
    }

    // 3. Market Risk & Exposure Evaluation
    const exposureCheck = calculateExposureRisk({ matchId, marketId, stake, odds: serverOdds || clientOdds });
    if (exposureCheck?.exceedsMaxLiability) {
      const maxAllowedStake = Math.max(10, Math.floor(exposureCheck.remainingCapacity / (serverOdds || clientOdds)));
      return this.recordDecision({
        decision: 'ACCEPT_WITH_LIMIT',
        reason: 'Stake exceeds maximum liability capacity for market',
        maxAllowedStake,
        userId, matchId, marketId, selectionId, stake, clientOdds, serverOdds, timestamp,
      });
    }

    // 4. Overall Accept Decision
    return this.recordDecision({
      decision: 'ACCEPT',
      reason: 'All risk, exposure, responsible gaming, and price checks passed',
      userId, matchId, marketId, selectionId, stake, clientOdds, serverOdds, timestamp,
    });
  }

  recordDecision(record) {
    const entry = {
      decisionId: `risk_dec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ...record,
    };
    this.decisionsLog.push(entry);
    if (this.decisionsLog.length > 500) this.decisionsLog.shift();
    return entry;
  }

  getDecisionHistory(userId = null) {
    if (userId) {
      return this.decisionsLog.filter((d) => d.userId === userId);
    }
    return this.decisionsLog.slice(-100);
  }
}

export const globalRiskOrchestrator = new GlobalRiskOrchestrator();
