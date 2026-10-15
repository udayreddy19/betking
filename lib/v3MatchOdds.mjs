/**
 * Winner-market decimals from the live OddsEngine (V5 default; V4 when ODDS_ENGINE=v4).
 */

import { buildCanonicalFromMatch } from './odds-shared/buildCanonicalFromMatch.mjs';
import { extractMatchWinnerOdds } from './odds-shared/extractMatchWinnerOdds.mjs';
import { generate as generateV5 } from './odds-v5/OddsEngineV5.mjs';
import { generate as generateV4 } from './odds-v4/OddsEngineV4.mjs';
import { resolveOddsEngineMode } from './odds-v5/EngineModeControl.mjs';
import { isMatchSRL } from './cricketSnapshot.mjs';

export function getMatchWinnerOddsFromEngine(match, options = {}) {
  const mode = resolveOddsEngineMode();
  const useV5 = mode === 'v5' || mode === 'shadow' || (mode !== 'v4' && isMatchSRL(match));
  const generate = useV5 ? generateV5 : generateV4;
  const snapshot = generate(buildCanonicalFromMatch(match), {
    winnerOnly: true,
    debug: false,
    ...options,
  });
  const winner = extractMatchWinnerOdds(snapshot, match);
  return {
    ...winner,
    engine: snapshot.engine || (useV5 ? 'OddsEngineV5' : 'OddsEngineV4'),
    engineVersion: snapshot.engineVersion || null,
    mode: useV5 ? (mode === 'shadow' ? 'shadow' : 'v5') : 'v4',
  };
}

export { getMatchWinnerOddsFromEngine as getV3MatchWinnerOdds };
