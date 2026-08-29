/**
 * Pure Settlement Confidence & Finality Decision Engine (lib/settlement/settlementConfidenceEngine.mjs)
 * Evaluates provider consensus, data freshness, and finality lifecycle states
 * before any financial settlement mutation is permitted.
 */

import { isCricketMatchCompleted } from '../../src/utils/cricketMatchComplete.js';

export const CONFIDENCE_STATES = {
  CONFIRMED: 'CONFIRMED',
  PROVISIONAL: 'PROVISIONAL',
  CONFLICT: 'CONFLICT',
  STALE: 'STALE',
  MISSING_DATA: 'MISSING_DATA',
  OFFICIAL_CONFIRMED: 'OFFICIAL_CONFIRMED',
  BLOCKED: 'BLOCKED',
};

export const CONFIDENCE_LEVELS = CONFIDENCE_STATES;

export const FINALITY_STATES = {
  LIVE: 'LIVE',
  PROVISIONAL_COMPLETE: 'PROVISIONAL_COMPLETE',
  FINAL_WAITING: 'FINAL_WAITING',
  OFFICIAL_CONFIRMED: 'OFFICIAL_CONFIRMED',
  SETTLEMENT_ELIGIBLE: 'SETTLEMENT_ELIGIBLE',
  SETTLED: 'SETTLED',
  ABANDONED: 'ABANDONED',
  REVERSED: 'REVERSED',
  UNKNOWN: 'UNKNOWN',
};

export const MARKET_FINALITY_POLICIES = {
  TOSS: { requiredGraceSeconds: 0, requireMatchFinal: false, requireEventFinal: true, allowSnapshotFinality: true },
  NEXT_BALL: { requiredGraceSeconds: 0, requireMatchFinal: false, requireEventFinal: true, allowSnapshotFinality: true },
  OVER_TOTAL: { requiredGraceSeconds: 0, requireMatchFinal: false, requireEventFinal: true, allowSnapshotFinality: true },
  WICKET_IN_OVER: { requiredGraceSeconds: 0, requireMatchFinal: false, requireEventFinal: true, allowSnapshotFinality: true },
  DISMISSAL_SCORE: { requiredGraceSeconds: 0, requireMatchFinal: false, requireEventFinal: true, allowSnapshotFinality: true },
  PLAYER_RUNS: { requiredGraceSeconds: 0, requireMatchFinal: false, requireEventFinal: true, allowSnapshotFinality: false },
  MATCH_WINNER: { requiredGraceSeconds: 30, requireMatchFinal: true, requireEventFinal: false, allowSnapshotFinality: false },
  TEAM_TOTAL: { requiredGraceSeconds: 0, requireMatchFinal: false, requireEventFinal: true, allowSnapshotFinality: false },
  ACCUMULATOR: { requiredGraceSeconds: 0, requireMatchFinal: false, requireEventFinal: true, allowSnapshotFinality: false },
  GENERIC: { requiredGraceSeconds: 0, requireMatchFinal: false, requireEventFinal: true, allowSnapshotFinality: false },
};

export function resolveMarketFinalityPolicy(marketTypeOrId = '') {
  const norm = String(marketTypeOrId || '').toUpperCase();
  if (norm.includes('TOSS')) return MARKET_FINALITY_POLICIES.TOSS;
  if (norm.includes('DELIVERY') || norm.includes('BALL')) return MARKET_FINALITY_POLICIES.NEXT_BALL;
  if (norm.includes('OVER_TOTAL') || norm.includes('NEXT_OVER')) return MARKET_FINALITY_POLICIES.OVER_TOTAL;
  if (norm.includes('WICKET_IN_OVER') || norm.includes('WICKET_IN_NEXT_OVER') || (norm.includes('WICKET') && norm.includes('OVER'))) return MARKET_FINALITY_POLICIES.WICKET_IN_OVER;
  if (norm.includes('DISMISSAL') || norm.includes('FOW') || norm.includes('SCORE_AT_')) return MARKET_FINALITY_POLICIES.DISMISSAL_SCORE;
  if (norm.includes('TEAM_TOTAL')) return MARKET_FINALITY_POLICIES.TEAM_TOTAL;
  if (norm.includes('PLAYER') || norm.includes('BATTER')) return MARKET_FINALITY_POLICIES.PLAYER_RUNS;
  if (norm.includes('WINNER') || norm.includes('MATCH')) return MARKET_FINALITY_POLICIES.MATCH_WINNER;
  if (norm.includes('PARLAY') || norm.includes('ACCUMULATOR')) return MARKET_FINALITY_POLICIES.ACCUMULATOR;
  return MARKET_FINALITY_POLICIES.GENERIC;
}

/** Default configuration */
export const DEFAULT_CONFIDENCE_CONFIG = {
  settlementDataMaxAgeSeconds: Number(process.env.SETTLEMENT_DATA_MAX_AGE_SECONDS) || 300,
  settlementFinalityGraceSeconds: Number(process.env.SETTLEMENT_FINALITY_GRACE_SECONDS) || Number(process.env.SETTLEMENT_GRACE_PERIOD_SECONDS) || 0,
  settlementGracePeriodSeconds: Number(process.env.SETTLEMENT_FINALITY_GRACE_SECONDS) || Number(process.env.SETTLEMENT_GRACE_PERIOD_SECONDS) || 0,
  requireProviderConsensus: process.env.REQUIRE_PROVIDER_CONSENSUS !== 'false',
};

/**
 * Compares multi-provider observations for material conflicts.
 * Evaluates: match status, innings, batting team, score, wickets, overs, winner, abandonment.
 */
export function evaluateProviderConsensus(observations = [], marketType = 'GENERIC') {
  if (!Array.isArray(observations) || observations.length === 0) {
    return {
      providersAvailable: 0,
      providersAgree: true,
      conflictingFields: [],
      observations: [],
    };
  }

  const valid = observations.filter((o) => o && (o.score != null || o.status != null || o.provider != null));
  if (valid.length <= 1) {
    return {
      providersAvailable: valid.length,
      providersAgree: true,
      conflictingFields: [],
      observations: valid,
    };
  }

  const conflictingFields = [];

  // 1. Check match status / abandonment disagreement
  const statuses = new Set(valid.map((o) => String(o.status || '').toUpperCase()).filter(Boolean));
  const hasAbandoned = statuses.has('ABANDONED') || statuses.has('CANCELLED');
  const hasCompleted = statuses.has('COMPLETED') || statuses.has('FINAL') || statuses.has('FINISHED');
  const hasLive = statuses.has('IN_PLAY') || statuses.has('LIVE') || statuses.has('IN');

  if (hasAbandoned && (hasCompleted || hasLive)) {
    conflictingFields.push('status');
  }

  // 2. Check score disagreement (> 1 run difference)
  const scores = valid.map((o) => Number(o.runs ?? o.score ?? NaN)).filter((n) => Number.isFinite(n));
  if (scores.length >= 2) {
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    if (maxScore - minScore > 1) {
      conflictingFields.push('score');
    }
  }

  // 3. Check wickets disagreement (>= 1 wicket difference)
  const wickets = valid.map((o) => Number(o.wickets ?? NaN)).filter((n) => Number.isFinite(n));
  if (wickets.length >= 2) {
    const minW = Math.min(...wickets);
    const maxW = Math.max(...wickets);
    if (maxW - minW >= 1) {
      conflictingFields.push('wickets');
    }
  }

  // 4. Check winner disagreement
  const winners = new Set(valid.map((o) => String(o.winner || '').trim().toLowerCase()).filter(Boolean));
  if (winners.size > 1) {
    conflictingFields.push('winner');
  }

  const providersAgree = conflictingFields.length === 0;

  return {
    providersAvailable: valid.length,
    observationsCount: valid.length,
    providersAgree,
    consensus: providersAgree,
    conflictingFields,
    observations: valid,
  };
}

/**
 * Authoritative Pure Decision Gate for Settlement.
 * Returns structured confidence assessment and definitive `settlementAllowed` boolean.
 */
export function evaluateSettlementConfidence({
  match,
  providerObservations = [],
  canonicalState = null,
  ballEvents = [],
  evidence = null,
  evaluatedOutcome = null,
  bet = null,
  marketContext = {},
  config = {},
}) {
  const cfg = { ...DEFAULT_CONFIDENCE_CONFIG, ...config };
  const settlementReasonCodes = [];
  const evaluatedAt = new Date().toISOString();
  const eventId = String(match?.id || match?.matchId || bet?.match_id || '');
  const marketId = String(bet?.market_id || marketContext?.marketId || '');

  // 1. Missing Match Data Check
  if (!match) {
    return {
      eventId,
      marketId,
      settlementAllowed: false,
      confidenceState: CONFIDENCE_STATES.MISSING_DATA,
      confidence: CONFIDENCE_STATES.MISSING_DATA,
      finalityState: FINALITY_STATES.UNKNOWN,
      finality: FINALITY_STATES.UNKNOWN,
      providerConsensus: {
        providersAvailable: 0,
        providersAgree: true,
        conflictingFields: [],
        observations: [],
      },
      freshness: {
        freshestTimestamp: null,
        ageSeconds: Infinity,
        maxAgeSeconds: cfg.settlementDataMaxAgeSeconds,
        stale: true,
      },
      evidenceStatus: 'MISSING_MATCH_OBJECT',
      settlementReasonCodes: ['MISSING_DATA: Match object unavailable or unhydrated'],
      reasons: ['MISSING_DATA: Match object unavailable or unhydrated'],
      evidence: [],
      settlementEligibleAt: null,
      evaluatedAt,
    };
  }

  // 2. Freshness & Stale Check
  const policy = resolveMarketFinalityPolicy(marketId || marketContext.marketType || '');
  const hasImmutableSnapshot = Boolean(
    marketContext.hasImmutableSnapshotEvidence
    || (policy.allowSnapshotFinality && evaluatedOutcome != null && marketContext.boundaryReached)
  );
  const isMarketProvenFinal = Boolean(policy.allowSnapshotFinality && hasImmutableSnapshot);

  const lastUpdatedAt = match.providerTimestamp || match.cachedAt || match.lastUpdatedAt || match.time;
  let ageSeconds = 0;
  let freshestTimestamp = null;

  if (lastUpdatedAt) {
    freshestTimestamp = new Date(lastUpdatedAt).toISOString();
    const time = new Date(lastUpdatedAt).getTime();
    if (Number.isFinite(time) && time > 0) {
      ageSeconds = Math.max(0, (Date.now() - time) / 1000);
    }
  }

  const rawStatus = String(match.status || match.liveStatus || '').toUpperCase();
  const isAbandoned = rawStatus === 'ABANDONED' || rawStatus === 'CANCELLED';
  const isFinalMatch = Boolean(
    ['COMPLETED', 'FINAL', 'FINISHED', 'CLOSED'].includes(rawStatus)
    || isAbandoned
    || String(match.matchState || '').toLowerCase() === 'post'
    || String(match.matchState || '').toLowerCase() === 'completed'
    || isCricketMatchCompleted(match)
  );

  const stale = !isFinalMatch && !isMarketProvenFinal && ageSeconds > cfg.settlementDataMaxAgeSeconds && cfg.settlementDataMaxAgeSeconds > 0;

  const freshness = {
    freshestTimestamp,
    ageSeconds: Math.round(ageSeconds),
    maxAgeSeconds: cfg.settlementDataMaxAgeSeconds,
    stale,
  };

  if (stale) {
    settlementReasonCodes.push(`STALE_DATA: In-play match data age (${Math.round(ageSeconds)}s) exceeds max allowed (${cfg.settlementDataMaxAgeSeconds}s)`);
    return {
      eventId,
      marketId,
      settlementAllowed: false,
      confidenceState: CONFIDENCE_STATES.STALE,
      confidence: CONFIDENCE_STATES.STALE,
      finalityState: FINALITY_STATES.LIVE,
      finality: FINALITY_STATES.LIVE,
      providerConsensus: {
        providersAvailable: 1,
        providersAgree: true,
        conflictingFields: [],
        observations: providerObservations,
      },
      freshness,
      evidenceStatus: 'STALE_IN_PLAY_DATA',
      settlementReasonCodes,
      reasons: settlementReasonCodes,
      evidence: [freshness],
      settlementEligibleAt: null,
      evaluatedAt,
    };
  }

  // 3. Provider Conflict Detection
  const consensusResult = evaluateProviderConsensus(providerObservations, marketContext.marketType);
  if (cfg.requireProviderConsensus && consensusResult.providersAvailable > 1 && !consensusResult.providersAgree) {
    settlementReasonCodes.push(
      `PROVIDER_CONFLICT: Disagreement on fields: ${consensusResult.conflictingFields.join(', ')}`,
    );
    return {
      eventId,
      marketId,
      settlementAllowed: false,
      confidenceState: CONFIDENCE_STATES.CONFLICT,
      confidence: CONFIDENCE_STATES.CONFLICT,
      finalityState: isFinalMatch ? FINALITY_STATES.PROVISIONAL_COMPLETE : FINALITY_STATES.LIVE,
      finality: isFinalMatch ? FINALITY_STATES.PROVISIONAL_COMPLETE : FINALITY_STATES.LIVE,
      providerConsensus: consensusResult,
      freshness,
      evidenceStatus: 'PROVIDER_DISAGREEMENT',
      settlementReasonCodes,
      reasons: settlementReasonCodes,
      evidence: [freshness],
      settlementEligibleAt: null,
      evaluatedAt,
    };
  }

  // 4. Finality & Grace Period Resolution
  let finalityState = FINALITY_STATES.LIVE;
  let confidenceState = CONFIDENCE_STATES.PROVISIONAL;
  let settlementEligibleAt = null;

  if (isAbandoned) {
    finalityState = FINALITY_STATES.ABANDONED;
    confidenceState = CONFIDENCE_STATES.CONFIRMED;
  } else if (isFinalMatch) {
    finalityState = FINALITY_STATES.PROVISIONAL_COMPLETE;
    confidenceState = CONFIDENCE_STATES.CONFIRMED;

    if (rawStatus === 'OFFICIAL_CONFIRMED' || match.isAuthoritativeFinal || match.officialConfirmed) {
      finalityState = FINALITY_STATES.OFFICIAL_CONFIRMED;
      confidenceState = CONFIDENCE_STATES.OFFICIAL_CONFIRMED;
    }

    const gracePeriodSec = Number(cfg.settlementGracePeriodSeconds || cfg.settlementFinalityGraceSeconds || 0);
    const matchEndTime = match.matchEndTime || match.finishedAt || match.cachedAt || match.lastUpdatedAt;
    let elapsedSinceEndSeconds = Infinity;
    if (matchEndTime) {
      const endMs = new Date(matchEndTime).getTime();
      if (Number.isFinite(endMs) && endMs > 0) {
        elapsedSinceEndSeconds = Math.max(0, (Date.now() - endMs) / 1000);
        settlementEligibleAt = new Date(endMs + gracePeriodSec * 1000).toISOString();
      }
    }

    if (gracePeriodSec > 0 && elapsedSinceEndSeconds < gracePeriodSec) {
      settlementReasonCodes.push(
        `FINALITY_GRACE_ACTIVE: Match finished ${Math.round(elapsedSinceEndSeconds)}s ago; awaiting ${gracePeriodSec}s grace window`,
      );
      return {
        eventId,
        marketId,
        settlementAllowed: false,
        confidenceState: CONFIDENCE_STATES.PROVISIONAL,
        confidence: CONFIDENCE_STATES.PROVISIONAL,
        finalityState: FINALITY_STATES.PROVISIONAL_COMPLETE,
        finality: FINALITY_STATES.PROVISIONAL_COMPLETE,
        providerConsensus: consensusResult,
        freshness,
        evidenceStatus: 'AWAITING_GRACE_PERIOD',
        settlementReasonCodes,
        reasons: settlementReasonCodes,
        evidence: [freshness],
        settlementEligibleAt,
        evaluatedAt,
      };
    }

    finalityState = FINALITY_STATES.SETTLEMENT_ELIGIBLE;
    confidenceState = CONFIDENCE_STATES.CONFIRMED;
  } else if (isMarketProvenFinal) {
    finalityState = FINALITY_STATES.SETTLEMENT_ELIGIBLE;
    confidenceState = CONFIDENCE_STATES.CONFIRMED;
  }

  // 5. In-play market boundary completion
  const isSegmentComplete = Boolean(
    marketContext.boundaryReached
    || marketContext.overCompleted
    || marketContext.ballConfirmed
    || isFinalMatch
    || isMarketProvenFinal
    || evaluatedOutcome != null
  );

  if (isSegmentComplete && confidenceState !== CONFIDENCE_STATES.OFFICIAL_CONFIRMED) {
    confidenceState = CONFIDENCE_STATES.CONFIRMED;
  }

  const settlementAllowed = Boolean(
    (confidenceState === CONFIDENCE_STATES.CONFIRMED || confidenceState === CONFIDENCE_STATES.OFFICIAL_CONFIRMED)
    && isSegmentComplete
  );

  if (!settlementAllowed && settlementReasonCodes.length === 0) {
    settlementReasonCodes.push('AWAITING_EVIDENCE: Market boundary or match finality has not been reached');
  }

  return {
    eventId,
    marketId,
    settlementAllowed,
    confidenceState,
    confidence: confidenceState,
    finalityState,
    finality: finalityState,
    providerConsensus: consensusResult,
    freshness,
    evidenceStatus: settlementAllowed ? 'READY_FOR_SETTLEMENT' : 'BLOCKED',
    settlementReasonCodes,
    reasons: settlementReasonCodes,
    evidence: [freshness],
    settlementEligibleAt,
    evaluatedAt,
  };
}
