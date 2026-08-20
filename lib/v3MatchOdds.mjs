/**
 * Winner-market decimals from OddsEngineV3. Never invents prices.
 */

import { generate as generateV3 } from './odds-v3/OddsEngineV3.mjs';
import { buildCanonicalFromMatch } from './odds-v3/buildCanonicalFromMatch.mjs';
import { extractMatchWinnerOdds } from './odds-v3/extractMatchWinnerOdds.mjs';

function isCricket(sport) {
  return sport === 'cricket' || sport === 'virtual-cricket' || !sport;
}

export function getV3WinnerDecimalBook(match = {}, options = {}) {
  const snapshot = isCricket(match.sport)
    ? generateV3(buildCanonicalFromMatch(match), { winnerOnly: true, debug: false, ...options })
    : generateV3(
      { ...match, matchId: match.id || match.matchId },
      { winnerOnly: true, debug: false, ...options },
    );

  const winner = extractMatchWinnerOdds(snapshot, match);
  const home = winner.team1;
  const away = winner.team2;
  if (!(home > 1) || !(away > 1)) {
    const err = new Error('V3_ODDS_UNAVAILABLE');
    err.code = 'V3_ODDS_UNAVAILABLE';
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
  };
}
