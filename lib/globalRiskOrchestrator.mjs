/**
 * Global Risk Orchestrator — Central Risk & Bet Acceptance Decision Engine — OddsYra (lib/globalRiskOrchestrator.mjs)
 * Evaluates risk across 7 operational domains: LOGIN, DEPOSIT, WITHDRAWAL, BET, BONUS, ACCOUNT_CHANGE, RESTRICTION.
 * Manages High-Value Bet Manual Review Queues, Exposure Controls, and Market State Rules.
 */

import { validateResponsibleGamingStatus, responsibleGamingEngine } from './responsibleGaming.mjs';
import { calculateExposureRisk, recordBetExposure, calculateMatchExposureMetrics } from './exposureEngine.mjs';
import { userSecurityCenter } from './userSecurityCenter.mjs';

let pgQuery = null;
async function safePgQuery(text, params) {
  if (typeof window !== 'undefined') return { rows: [], rowCount: 0 };
  try {
    if (!pgQuery) {
      const mod = await import('../db/pg.js');
      pgQuery = mod.query;
    }
    return await pgQuery(text, params);
  } catch (err) {
    console.error('[GlobalRiskOrchestrator PG Warning]', err.message);
    return { rows: [], rowCount: 0 };
  }
}

class GlobalRiskOrchestrator {
  constructor() {
    this.decisionsLog = [];
    this.highValueReviewQueue = new Map(); // betId -> betObj
    this.largeBetThreshold = 25000; // Default ₹25,000 threshold for manual review
  }

  // ---------------------------------------------------------------------------
  // 1. UNIVERSAL 7-DOMAIN RISK EVALUATION ENGINE
  // ---------------------------------------------------------------------------
  async evaluateDomainEvent(domain, payload = {}) {
    const { userId = 'anonymous', ipAddress = '127.0.0.1', amount = 0, stake = 0, details = {} } = payload;
    const timestamp = new Date().toISOString();
    const signals = [];
    let score = 0;

    // Check account restriction status
    const secStatus = userSecurityCenter.getAccountControlStatus(userId);
    if (secStatus.isRestricted) {
      return this.recordDecision({
        domain,
        decision: 'BLOCK',
        reason: `Account is ${secStatus.accountState}`,
        score: 100,
        signals: ['ACCOUNT_RESTRICTED'],
        userId,
        timestamp,
      });
    }

    // Evaluate Domain-Specific Signals & Risk Score
    switch (domain) {
      case 'LOGIN': {
        const userDevs = userSecurityCenter.getUserDevices(userId);
        if (userDevs.length > 3) {
          signals.push('MULTI_DEVICE_LOGIN_PATTERN');
          score += 20;
        }
        break;
      }

      case 'DEPOSIT': {
        const depCheck = await responsibleGamingEngine.validateDepositAttempt(userId, amount);
        if (!depCheck.allowed) {
          return this.recordDecision({
            domain,
            decision: 'BLOCK',
            reason: depCheck.message || `Deposit rejected: ${depCheck.reason}`,
            score: 85,
            signals: ['RESPONSIBLE_GAMING_DEPOSIT_LIMIT_VIOLATION'],
            userId,
            amount,
            timestamp,
          });
        }
        if (amount >= 100000) {
          signals.push('HIGH_VALUE_DEPOSIT_VELOCITY');
          score += 30;
        }
        break;
      }

      case 'WITHDRAWAL': {
        const alerts = userSecurityCenter.getUserSecurityAlerts(userId);
        const recentSecAlert = alerts.some(a => (Date.now() - new Date(a.createdAt).getTime()) < 24 * 60 * 60 * 1000);
        if (recentSecAlert) {
          signals.push('WITHDRAWAL_AFTER_SECURITY_ALERT');
          score += 45;
        }
        break;
      }

      case 'BONUS': {
        if (details.isDuplicateDevice || details.hasClaimedPromotionBefore) {
          signals.push('SUSPECTED_BONUS_CYCLING_OR_MULTI_ACCOUNT');
          score += 50;
        }
        break;
      }

      default:
        break;
    }

    // Determine Final Decision
    let decision = 'ALLOW';
    if (score >= 80) decision = 'BLOCK';
    else if (score >= 50) decision = 'RESTRICT';
    else if (score >= 30) decision = 'REVIEW';
    else if (score >= 15) decision = 'MONITOR';

    return this.recordDecision({
      domain,
      decision,
      reason: `Evaluated ${signals.length} signals with risk score ${score}`,
      score,
      signals,
      userId,
      timestamp,
      payload,
    });
  }

  // ---------------------------------------------------------------------------
  // 2. BET ACCEPTANCE & HIGH-VALUE MANUAL REVIEW WORKFLOW
  // ---------------------------------------------------------------------------
  async evaluateBetRequest({
    betId = null,
    userId = 'anonymous',
    matchId = 'global_match',
    marketId = 'winner',
    selectionId = 'home',
    clientOdds = 1.95,
    serverOdds = 1.95,
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
        domain: 'BET',
        decision: 'REQUIRE_ODDS_CONFIRMATION',
        reason: 'Match version out of date (odds updated)',
        userId, matchId, marketId, selectionId, stake, clientOdds, serverOdds, timestamp,
      });
    }

    if (serverOdds && Math.abs(clientOdds - serverOdds) > 0.05) {
      return this.recordDecision({
        domain: 'BET',
        decision: 'REPRICE',
        reason: `Odds moved from ${clientOdds} to ${serverOdds}`,
        proposedOdds: serverOdds,
        userId, matchId, marketId, selectionId, stake, clientOdds, serverOdds, timestamp,
      });
    }

    // 2. Server-side Responsible Gaming Evaluation
    const rgCheck = await responsibleGamingEngine.validateBetPlacementAttempt(userId, stake);
    if (!rgCheck.allowed) {
      return this.recordDecision({
        domain: 'BET',
        decision: 'REJECT',
        reason: rgCheck.message || `Responsible Gaming violation: ${rgCheck.reason}`,
        userId, matchId, marketId, selectionId, stake, clientOdds, serverOdds, timestamp,
      });
    }

    // 3. High-Value Bet Threshold Check (Phase 6 Workflow)
    const activeBetId = betId || `bet_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    if (stake >= this.largeBetThreshold) {
      const pendingBet = {
        betId: activeBetId,
        userId,
        matchId,
        marketId,
        selectionId,
        stake,
        odds: serverOdds || clientOdds,
        potentialPayout: stake * (serverOdds || clientOdds),
        status: 'PENDING_MANUAL_REVIEW',
        createdAt: timestamp,
      };
      this.highValueReviewQueue.set(activeBetId, pendingBet);

      return this.recordDecision({
        domain: 'BET',
        decision: 'MANUAL_REVIEW',
        reason: `Stake of ₹${stake} exceeds large bet threshold of ₹${this.largeBetThreshold}. Escalate to Admin Trading Desk.`,
        betId: activeBetId,
        userId, matchId, marketId, selectionId, stake, clientOdds, serverOdds, timestamp,
      });
    }

    // 4. Market Liability & Exposure Check (Phase 5)
    const exposureCheck = calculateExposureRisk({ matchId, marketId, stake, odds: serverOdds || clientOdds });
    if (exposureCheck?.exceedsMaxLiability) {
      const maxAllowedStake = Math.max(10, Math.floor(exposureCheck.remainingCapacity / (serverOdds || clientOdds)));
      return this.recordDecision({
        domain: 'BET',
        decision: 'ACCEPT_WITH_LIMIT',
        reason: 'Stake exceeds maximum liability capacity for market',
        maxAllowedStake,
        userId, matchId, marketId, selectionId, stake, clientOdds, serverOdds, timestamp,
      });
    }

    // Record exposure
    recordBetExposure({ matchId, marketId, selectionId, stake, odds: serverOdds || clientOdds });

    // 5. Final Accept Decision
    return this.recordDecision({
      domain: 'BET',
      decision: 'ACCEPT',
      reason: 'All risk, exposure, responsible gaming, and price checks passed',
      userId, matchId, marketId, selectionId, stake, clientOdds, serverOdds, timestamp,
    });
  }

  // Admin High-Value Bet Review Actions
  async approveHighValueBet(betId, operatorId = 'trader_admin') {
    const bet = this.highValueReviewQueue.get(betId);
    if (!bet) throw new Error(`High Value Bet #${betId} not found in review queue`);

    bet.status = 'APPROVED';
    bet.approvedBy = operatorId;
    bet.approvedAt = new Date().toISOString();
    this.highValueReviewQueue.delete(betId);

    recordBetExposure(bet);
    return { success: true, bet };
  }

  async rejectHighValueBet(betId, reason = 'Trade Desk Risk Threshold', operatorId = 'trader_admin') {
    const bet = this.highValueReviewQueue.get(betId);
    if (!bet) throw new Error(`High Value Bet #${betId} not found in review queue`);

    bet.status = 'REJECTED';
    bet.rejectedBy = operatorId;
    bet.rejectionReason = reason;
    this.highValueReviewQueue.delete(betId);

    return { success: true, bet };
  }

  getHighValueReviewQueue() {
    return Array.from(this.highValueReviewQueue.values());
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
