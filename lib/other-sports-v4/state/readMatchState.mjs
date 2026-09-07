/**
 * Normalize live score / clock / sets for OtherSportsEngineV4.
 * Reuses V3 score readers so feed shapes stay consistent.
 */

export {
  readLiveScoreState,
  isFinishedMatch,
  isLiveMatch,
  parseMinute,
  parseQuarterElapsedMinutes,
  isLiveClockKnown,
  hasSetScores,
  countSetWins,
  totalSetUnits,
} from '../../odds-v3/sports/readLiveScoreState.mjs';

export function teamName(team, fallback = 'Team') {
  if (team == null) return fallback;
  if (typeof team === 'string') return team;
  return team.name || team.shortName || fallback;
}
