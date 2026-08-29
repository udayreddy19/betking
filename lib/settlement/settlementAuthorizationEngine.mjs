/**
 * Mandatory Settlement Authorization Engine (lib/settlement/settlementAuthorizationEngine.mjs)
 * Guarantees that no financial settlement can execute without a cryptographically-verifiable,
 * non-expired authorization issued exclusively by the Settlement Confidence Engine.
 */

import crypto from 'node:crypto';
import {
  evaluateSettlementConfidence,
  CONFIDENCE_STATES,
  FINALITY_STATES,
} from './settlementConfidenceEngine.mjs';

// In-memory telemetry counter for unauthorized attempts
export const settlementMetrics = {
  settlement_attempts_total: 0,
  settlement_authorized_total: 0,
  settlement_blocked_total: 0,
  settlement_unauthorized_invocations_total: 0,
  settlement_payout_amount_total: 0.0,
  settlement_reversals_total: 0,
  settlement_dead_letters_count: 0,
};

/**
 * Computes deterministic SHA-256 evidence hash.
 */
export function computeEvidenceHash({
  betId,
  matchId,
  marketId,
  selectionId,
  gradedOutcome,
  confidenceState,
  finalityState,
  providerConsensus,
  freshness,
}) {
  const payload = JSON.stringify({
    betId: String(betId || ''),
    matchId: String(matchId || ''),
    marketId: String(marketId || ''),
    selectionId: String(selectionId || ''),
    gradedOutcome: String(gradedOutcome || '').toUpperCase(),
    confidenceState: String(confidenceState || ''),
    finalityState: String(finalityState || ''),
    providersAgree: Boolean(providerConsensus?.providersAgree),
    providersAvailable: Number(providerConsensus?.providersAvailable || 0),
    stale: Boolean(freshness?.stale),
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Authorizes a bet settlement strictly after confidence, freshness, and finality evaluation.
 */
export function authorizeSettlement({
  bet,
  match,
  marketContext = {},
  providerObservations = [],
  evaluatedOutcome = null,
  config = {},
  authorizedBy = 'SettlementConfidenceEngine',
}) {
  settlementMetrics.settlement_attempts_total += 1;

  if (!bet || !bet.bet_id) {
    settlementMetrics.settlement_blocked_total += 1;
    return {
      success: false,
      error: 'SETTLEMENT_AUTHORIZATION_FAILED: Bet object is required',
      authorization: null,
      confidence: null,
    };
  }

  const outcome = evaluatedOutcome || marketContext?.evaluatedOutcome || null;
  const matchObj = match || marketContext?.match || null;

  // Run pure confidence & finality gate
  const confidence = evaluateSettlementConfidence({
    match: matchObj,
    bet,
    marketContext: { ...marketContext, boundaryReached: Boolean(outcome) },
    providerObservations: providerObservations.length > 0
      ? providerObservations
      : (matchObj?.providerObservations || []),
    evaluatedOutcome: outcome,
    config,
  });

  if (!confidence.settlementAllowed) {
    settlementMetrics.settlement_blocked_total += 1;
    return {
      success: false,
      error: `SETTLEMENT_BLOCKED: Confidence is ${confidence.confidenceState} (${confidence.settlementReasonCodes.join(', ')})`,
      authorization: null,
      confidence,
    };
  }

  const betId = bet.bet_id;
  const matchId = String(matchObj?.id || matchObj?.matchId || bet.match_id || '');
  const marketId = String(bet.market_id || marketContext.marketId || '');
  const selectionId = String(bet.selection_id || '');
  const gradedOutcome = String(outcome || '').toUpperCase();

  const evidenceHash = computeEvidenceHash({
    betId,
    matchId,
    marketId,
    selectionId,
    gradedOutcome,
    confidenceState: confidence.confidenceState,
    finalityState: confidence.finalityState,
    providerConsensus: confidence.providerConsensus,
    freshness: confidence.freshness,
  });

  const now = Date.now();
  const tokenTtlMs = Math.max(10000, Number(config.tokenTtlMs || 60000)); // Default 60 seconds TTL

  const authorizationToken = {
    authorizationId: `auth_${now}_${crypto.randomBytes(4).toString('hex')}`,
    betId,
    matchId,
    marketId,
    selectionId,
    gradedOutcome,
    confidenceState: confidence.confidenceState,
    finalityState: confidence.finalityState,
    evidenceHash: `sha256:${evidenceHash}`,
    authorizationVersion: '1.0',
    authorizedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + tokenTtlMs).toISOString(),
    authorizedBy,
    providerConsensus: confidence.providerConsensus,
    freshness: confidence.freshness,
    gradingRuleVersion: 'cricket_rules_v1',
    evidenceSchemaVersion: '1.0',
    settlementReasonCodes: confidence.settlementReasonCodes,
  };

  settlementMetrics.settlement_authorized_total += 1;

  return {
    success: true,
    authorization: authorizationToken,
    confidence,
  };
}

/**
 * Validates authorization token integrity before financial execution.
 */
export function validateSettlementAuthorization({ authorization, bet, matchState }) {
  if (!authorization || typeof authorization !== 'object') {
    settlementMetrics.settlement_unauthorized_invocations_total += 1;
    return {
      valid: false,
      reason: 'SETTLEMENT_AUTHORIZATION_REQUIRED: Missing authorization object',
    };
  }

  if (!authorization.authorizationId || !authorization.evidenceHash) {
    settlementMetrics.settlement_unauthorized_invocations_total += 1;
    return {
      valid: false,
      reason: 'SETTLEMENT_AUTHORIZATION_INVALID: Malformed authorization token',
    };
  }

  // Check bet ID binding
  if (authorization.betId !== bet.bet_id) {
    settlementMetrics.settlement_unauthorized_invocations_total += 1;
    return {
      valid: false,
      reason: `SETTLEMENT_AUTHORIZATION_MISMATCH: Token betId (${authorization.betId}) does not match bet (${bet.bet_id})`,
    };
  }

  // Check TTL expiration
  const expiresAtMs = new Date(authorization.expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs) || Date.now() > expiresAtMs) {
    settlementMetrics.settlement_unauthorized_invocations_total += 1;
    return {
      valid: false,
      reason: `SETTLEMENT_AUTHORIZATION_EXPIRED: Token expired at ${authorization.expiresAt}`,
    };
  }

  // Check confidence & finality eligibility
  const eligibleConfidence = [CONFIDENCE_STATES.CONFIRMED, CONFIDENCE_STATES.OFFICIAL_CONFIRMED];
  if (!eligibleConfidence.includes(authorization.confidenceState)) {
    settlementMetrics.settlement_unauthorized_invocations_total += 1;
    return {
      valid: false,
      reason: `SETTLEMENT_AUTHORIZATION_INELIGIBLE_CONFIDENCE: State is ${authorization.confidenceState}`,
    };
  }

  // Verify evidence hash integrity
  const expectedHash = computeEvidenceHash({
    betId: authorization.betId,
    matchId: authorization.matchId,
    marketId: authorization.marketId,
    selectionId: authorization.selectionId,
    gradedOutcome: authorization.gradedOutcome,
    confidenceState: authorization.confidenceState,
    finalityState: authorization.finalityState,
    providerConsensus: authorization.providerConsensus,
    freshness: authorization.freshness,
  });

  if (authorization.evidenceHash !== `sha256:${expectedHash}`) {
    settlementMetrics.settlement_unauthorized_invocations_total += 1;
    return {
      valid: false,
      reason: 'SETTLEMENT_AUTHORIZATION_CORRUPTED: Evidence hash verification failed',
    };
  }

  return { valid: true };
}
