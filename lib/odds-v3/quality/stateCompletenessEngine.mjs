/**
 * OddsEngineV3 — Canonical State Completeness & Temporal Ordering Engine
 * 
 * Verifies that incoming match states contain all necessary domain fields
 * and enforces strict monotonic temporal ordering without clock anomalies.
 */

const REQUIRED_SPORT_FIELDS = {
  cricket: ['runs', 'wickets', 'ballsCompleted', 'format'],
  soccer: ['minute', 'score1', 'score2'],
  tennis: ['sets1', 'sets2', 'games1', 'games2'],
  basketball: ['quarter', 'score1', 'score2'],
};

/**
 * Evaluates state completeness and temporal validity.
 */
export function evaluateStateCompleteness({
  sport = 'cricket',
  matchState = {},
  previousStateVersion = 0,
  previousTimestamp = null,
} = {}) {
  const normSport = String(sport).toLowerCase();
  const reqFields = REQUIRED_SPORT_FIELDS[normSport] || ['score1', 'score2'];
  const missingFields = [];

  for (const field of reqFields) {
    if (matchState[field] === undefined && matchState.liveDetails?.[field] === undefined) {
      missingFields.push(field);
    }
  }

  // Completeness score
  const completenessFraction = (reqFields.length - missingFields.length) / reqFields.length;
  const completenessScore = Math.round(completenessFraction * 100);

  // Temporal validation
  const now = Date.now();
  const currentTs = new Date(matchState.timestamp || matchState.lastUpdated || now).getTime();
  const prevTs = previousTimestamp ? new Date(previousTimestamp).getTime() : 0;

  const isFutureSkew = currentTs > now + 60000; // > 60s in future
  const isOutdatedVersion = matchState.stateVersion != null && matchState.stateVersion < previousStateVersion;
  const isTimeRegressed = prevTs > 0 && currentTs < prevTs - 5000; // regressed by > 5s

  const temporalOrderValid = !isFutureSkew && !isOutdatedVersion && !isTimeRegressed;
  const reasons = [];

  if (missingFields.length > 0) reasons.push(`Missing fields: ${missingFields.join(', ')}`);
  if (isFutureSkew) reasons.push('Future clock skew detected');
  if (isOutdatedVersion) reasons.push(`State version regressed (${matchState.stateVersion} < ${previousStateVersion})`);
  if (isTimeRegressed) reasons.push('Timestamp regression detected');

  return {
    valid: missingFields.length === 0 && temporalOrderValid,
    completenessScore,
    missingFields,
    temporalOrderValid,
    isFutureSkew,
    isOutdatedVersion,
    reasons: reasons.length > 0 ? reasons : ['STATE_COMPLETE_AND_ORDERED'],
    evaluatedAt: new Date().toISOString(),
  };
}
