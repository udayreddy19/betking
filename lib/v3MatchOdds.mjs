/**
 * Winner-market decimals from the live OddsEngine (V5 default; V4 when ODDS_ENGINE=v4).
 * On V5 exception, falls back to V4 like engineDispatch.
 */

import { buildCanonicalFromMatch } from './odds-shared/buildCanonicalFromMatch.mjs';
import { extractMatchWinnerOdds } from './odds-shared/extractMatchWinnerOdds.mjs';
import { generate as generateV5 } from './odds-v5/OddsEngineV5.mjs';
import { generate as generateV4 } from './odds-v4/OddsEngineV4.mjs';
import { resolveOddsEngineMode } from './odds-v5/EngineModeControl.mjs';
import { isMatchSRL } from './cricketSnapshot.mjs';

export function getMatchWinnerOddsFromEngine(match, options = {}) {
  const mode = resolveOddsEngineMode();
  const preferV5 = mode === 'v5' || mode === 'shadow' || (mode !== 'v4' && isMatchSRL(match));
  const canonical = buildCanonicalFromMatch(match);
  const genOpts = { winnerOnly: true, debug: false, ...options };

  if (preferV5) {
    try {
      const snapshot = generateV5(canonical, genOpts);
      const winner = extractMatchWinnerOdds(snapshot, match);
      if (winner.team1 != null && winner.team2 != null) {
        return {
          ...winner,
          engine: snapshot.engine || 'OddsEngineV5',
          engineVersion: snapshot.engineVersion || null,
          mode: mode === 'shadow' ? 'shadow' : 'v5',
          fallbackReason: null,
        };
      }
    } catch {
      /* fall through to V4 */
    }
  }

  const snapshot = generateV4(canonical, genOpts);
  const winner = extractMatchWinnerOdds(snapshot, match);
  return {
    ...winner,
    engine: snapshot.engine || 'OddsEngineV4',
    engineVersion: snapshot.engineVersion || null,
    mode: preferV5 ? 'v4' : 'v4',
    fallbackReason: preferV5 ? 'V5_EXCEPTION' : null,
  };
}

export { getMatchWinnerOddsFromEngine as getV3MatchWinnerOdds };
