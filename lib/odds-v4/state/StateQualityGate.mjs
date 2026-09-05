/**
 * OddsEngineV4 — refuse / suspend when match state is not bettable.
 */

const STALE_FEED_MS = 60_000;

export function evaluateStateQuality(state) {
  const reasons = [];
  if (!state) {
    return { ok: false, suspendAll: true, reasons: ['MISSING_STATE'], phase: 'UNKNOWN' };
  }

  if (!['T10', 'T20', 'ODI', 'TEST', 'THE_HUNDRED', 'LIST_A'].includes(String(state.format))) {
    reasons.push('UNKNOWN_FORMAT');
  }
  if (state.formatConfidence === 'low') reasons.push('LOW_FORMAT_CONFIDENCE');

  if (state.status === 'COMPLETED') {
    return {
      ok: true,
      suspendAll: false,
      suspendWinner: false,
      settled: true,
      reasons: [],
      phase: 'COMPLETED',
      ballFeedOk: false,
      battersOk: false,
    };
  }

  if (Number(state.ballsPerInnings) <= 0) reasons.push('INVALID_BALLS_PER_INNINGS');
  if (Number(state.ballsRemaining) < 0) reasons.push('NEGATIVE_BALLS_REMAINING');
  if (Number(state.wicketsInHand) < 0 || Number(state.wicketsInHand) > 10) reasons.push('INVALID_WICKETS');

  if (Number(state.currentInnings) >= 2) {
    const hasTarget = state.target != null && Number(state.target) > 0;
    const hasRunsRequired = state.runsRequired != null && Number.isFinite(Number(state.runsRequired));
    if (!hasTarget && !hasRunsRequired) {
      reasons.push('CHASE_MISSING_TARGET');
    }
    if (state.firstInningsRuns == null || Number(state.firstInningsRuns) < 0) {
      reasons.push('CHASE_MISSING_FIRST_INNINGS');
    }
  }

  if (Number(state.ballFeedAgeMs) > STALE_FEED_MS) reasons.push('STALE_FEED');

  const suspendAll = reasons.some((r) => [
    'UNKNOWN_FORMAT',
    'INVALID_BALLS_PER_INNINGS',
    'NEGATIVE_BALLS_REMAINING',
  ].includes(r));

  const suspendWinner = suspendAll || reasons.some((r) => [
    'CHASE_MISSING_TARGET',
    'CHASE_MISSING_FIRST_INNINGS',
  ].includes(r));

  return {
    ok: reasons.length === 0,
    suspendAll,
    suspendWinner,
    settled: false,
    reasons,
    phase: state.phase || (Number(state.currentInnings) >= 2 ? 'CHASE' : 'INNINGS_1'),
    ballFeedOk: Boolean(state.hasBallFeed) && Number(state.ballFeedAgeMs) <= STALE_FEED_MS,
    battersOk: Boolean(state.hasNamedBatters),
  };
}
