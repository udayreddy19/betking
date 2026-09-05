/**
 * Winner-market decimals from OddsEngine (V3 default; V4 when ODDS_ENGINE=v4).
 */

import { generate as generateV3 } from './odds-v3/OddsEngineV3.mjs';
import { buildCanonicalFromMatch } from './odds-v3/buildCanonicalFromMatch.mjs';
import { extractMatchWinnerOdds } from './odds-v3/extractMatchWinnerOdds.mjs';
import { generate as generateV4 } from './odds-v4/OddsEngineV4.mjs';
import { resolveOddsEngineMode } from './odds-v4/EngineModeControl.mjs';

function isCricket(sport) {
  return sport === 'cricket' || sport === 'virtual-cricket' || !sport;
}

export function getV3WinnerDecimalBook(match = {}, options = {}) {
  const mode = resolveOddsEngineMode();
  const cricket = isCricket(match.sport);
  const generate = cricket && mode === 'v4' ? generateV4 : generateV3;

  const snapshot = cricket
    ? generate(buildCanonicalFromMatch(match), { winnerOnly: true, debug: false, ...options })
    : generateV3(
      { ...match, matchId: match.id || match.matchId },
      { winnerOnly: true, debug: false, ...options },
    );

  const winner = extractMatchWinnerOdds(snapshot, match);
  const home = winner.team1;
  const away = winner.team2;
  if (!(home > 1) || !(away > 1)) {
    const err = new Error(mode === 'v4' ? 'V4_ODDS_UNAVAILABLE' : 'V3_ODDS_UNAVAILABLE');
    err.code = err.message;
    err.status = winner.status;
    throw err;
  }

  return {
    matchId: match.id || match.matchId,
    snapshot,
    odds: {
      home: { decimal: home },
      away: { decimal: away },
      draw: winner.draw > 1 ? { decimal: winner.draw } : null,
    },
    engine: snapshot.engine || (mode === 'v4' ? 'OddsEngineV4' : 'OddsEngineV3'),
  };
}
