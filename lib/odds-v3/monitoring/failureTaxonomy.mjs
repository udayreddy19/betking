/**
 * OddsEngineV3 — Model Failure Taxonomy Engine
 * 
 * Classifies operational and mathematical anomalies into 9 standard failure modes:
 * - INPUT_FAILURE: Invalid canonical state structure or unparseable match feeds
 * - STALE_FEED: Feed arrival age exceeds 15s circuit breaker threshold
 * - PROVIDER_FAILURE: Provider API downtime or HTTP error codes
 * - MODEL_FAILURE: Internal NaN/Inf math error in sport probability model
 * - CALIBRATION_FAILURE: Severe ECE/Brier out-of-sample degradation
 * - PRICING_FAILURE: Market overround calculation violation or negative odds
 * - TELEMETRY_FAILURE: Buffer overflow or serialization failure in observation store
 * - SETTLEMENT_JOIN_FAILURE: Unmatched prediction-outcome market keys
 * - DATA_QUALITY_FAILURE: Future timestamps or duplicate event IDs
 */

export const FAILURE_CATEGORIES = Object.freeze({
  INPUT_FAILURE: 'INPUT_FAILURE',
  STALE_FEED: 'STALE_FEED',
  PROVIDER_FAILURE: 'PROVIDER_FAILURE',
  MODEL_FAILURE: 'MODEL_FAILURE',
  CALIBRATION_FAILURE: 'CALIBRATION_FAILURE',
  PRICING_FAILURE: 'PRICING_FAILURE',
  TELEMETRY_FAILURE: 'TELEMETRY_FAILURE',
  SETTLEMENT_JOIN_FAILURE: 'SETTLEMENT_JOIN_FAILURE',
  DATA_QUALITY_FAILURE: 'DATA_QUALITY_FAILURE',
});

const failureRegistry = [];

export function recordModelFailure({
  category,
  matchId = 'unknown',
  sport = 'unknown',
  market = 'unknown',
  details = '',
  impact = 'LOW',
  recoveryAction = 'NONE',
}) {
  const record = {
    id: `fail_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    category: FAILURE_CATEGORIES[category] || FAILURE_CATEGORIES.MODEL_FAILURE,
    matchId: String(matchId),
    sport: String(sport).toLowerCase(),
    market: String(market),
    details: String(details),
    impact: String(impact),
    recoveryAction: String(recoveryAction),
  };

  failureRegistry.push(record);
  if (failureRegistry.length > 5000) {
    failureRegistry.shift();
  }
  return record;
}

export function getFailureTaxonomyReport() {
  const summary = {};
  for (const cat of Object.keys(FAILURE_CATEGORIES)) {
    summary[cat] = {
      count: 0,
      impact: 'NONE',
      affectedSports: new Set(),
      affectedMarkets: new Set(),
      recoveryBehavior: getStandardRecoveryBehavior(cat),
    };
  }

  for (const fail of failureRegistry) {
    const s = summary[fail.category];
    if (s) {
      s.count++;
      s.affectedSports.add(fail.sport);
      s.affectedMarkets.add(fail.market);
      if (fail.impact === 'HIGH' || (fail.impact === 'MEDIUM' && s.impact === 'NONE')) {
        s.impact = fail.impact;
      }
    }
  }

  const result = {};
  for (const [cat, s] of Object.entries(summary)) {
    result[cat] = {
      count: s.count,
      impact: s.impact,
      affectedSports: Array.from(s.affectedSports),
      affectedMarkets: Array.from(s.affectedMarkets),
      recoveryBehavior: s.recoveryBehavior,
    };
  }

  return {
    totalFailuresRecorded: failureRegistry.length,
    taxonomy: result,
    generatedAt: new Date().toISOString(),
  };
}

function getStandardRecoveryBehavior(category) {
  switch (category) {
    case FAILURE_CATEGORIES.STALE_FEED:
      return 'Trip feed latency circuit breaker and suspend affected live markets.';
    case FAILURE_CATEGORIES.PROVIDER_FAILURE:
      return 'Failover to secondary provider; drop failed provider blend weight.';
    case FAILURE_CATEGORIES.MODEL_FAILURE:
      return 'Fallback to authoritative baseline model or historical pre-match priors.';
    case FAILURE_CATEGORIES.TELEMETRY_FAILURE:
      return 'Drop oldest non-blocking buffer entry; never block live pricing path.';
    case FAILURE_CATEGORIES.SETTLEMENT_JOIN_FAILURE:
      return 'Queue for reconciliation retry; financial ledger payout unaffected.';
    default:
      return 'Log incident to Ops Alert engine and maintain defensive spread.';
  }
}
