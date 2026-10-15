/**
 * Decide when OtherSportsEngineV5 may price without provider odds
 * using live score / clock state alone.
 */

import { isLiveMatch, readLiveScoreState } from './state/readMatchState.mjs';

/**
 * True when live feed has enough state for Dixon-Coles / pace / set models
 * without provider odds (avoids empty books when ESPN odds lag scores).
 */
export function hasUsableLiveModelInputs(match, sport) {
  if (!isLiveMatch(match)) return false;
  const state = readLiveScoreState(match);
  const s = String(sport || '').toLowerCase();
  if (s === 'tennis') {
    return Boolean(state.hasSetScores)
      || (Number.isFinite(state.score1) && Number.isFinite(state.score2)
        && (state.score1 > 0 || state.score2 > 0 || state.setWins1 > 0 || state.setWins2 > 0));
  }
  // Score sports: 0–0 is valid once the clock is known (or minute progressed).
  if (!Number.isFinite(state.score1) || !Number.isFinite(state.score2)) return false;
  if (state.clockKnown || state.minute >= 1) return true;
  // Basketball / AF / hockey / baseball often expose period before minute parse.
  if (s === 'basketball' || s === 'american-football' || s === 'ice-hockey' || s === 'baseball') {
    const ld = state.liveDetails || {};
    return Boolean(ld.period || ld.quarter || ld.inning || ld.clock);
  }
  return false;
}
