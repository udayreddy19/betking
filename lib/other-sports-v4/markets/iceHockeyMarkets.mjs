/**
 * Ice hockey markets — moneyline (incl. OT), puck line (±1.5), total goals O/U.
 */

import { exclusiveMarket, twoWayMarket, bookPoints } from '../book/helpers.mjs';
import { overroundForMarket, OSV4_MARGIN_CONFIG } from '../pricing/MarginPolicy.mjs';
import { withLiveBump } from '../book/houseProtect.mjs';
import { calculateIceHockeyProbabilities } from '../models/iceHockeyModel.mjs';
import { readLiveScoreState } from '../state/readMatchState.mjs';
import { blendWinnerProbs } from '../providerBlend.mjs';

function readHockeyState(match) {
  const { score1, score2, minute } = readLiveScoreState(match);
  // Period × 20 minutes
  const period = Number(match?.liveDetails?.period) || Math.max(1, Math.ceil(minute / 20));
  return { score1, score2, minute, period };
}

export function generateIceHockeyMatchWinner(match, team1Name, team2Name, margins = OSV4_MARGIN_CONFIG) {
  const { score1, score2, minute } = readHockeyState(match);
  const hk = calculateIceHockeyProbabilities({
    currentHomeScore: score1,
    currentAwayScore: score2,
    minute,
  });
  const blended = blendWinnerProbs({
    model: [hk.pHomeWin, hk.pAwayWin],
    hasDraw: false,
    match,
    providerWeight: margins.providerBlendWeight,
  });
  const overround = withLiveBump(overroundForMarket('winner', margins), match, margins);
  const market = exclusiveMarket({
    marketId: 'match_winner',
    marketType: 'MATCH_WINNER',
    name: 'Moneyline (incl. OT)',
    category: 'main',
    outcomes: [
      { selectionId: '1', name: team1Name, probability: blended.p1 },
      { selectionId: '2', name: team2Name, probability: blended.p2 },
    ],
    overround,
    margins,
  });
  if (market.status === 'OPEN') {
    return Object.freeze({ ...market, bookPoints: bookPoints(market.selections), _hk: hk });
  }
  return Object.freeze({ ...market, _hk: hk });
}

export function generateIceHockeyExtras(match, team1Name, team2Name, winnerMarket, margins = OSV4_MARGIN_CONFIG) {
  const { score1, score2, minute } = readHockeyState(match);
  const hk = winnerMarket?._hk || calculateIceHockeyProbabilities({
    currentHomeScore: score1,
    currentAwayScore: score2,
    minute,
  });
  const totalsOo = withLiveBump(overroundForMarket('totals', margins), match, margins);

  const puckLine = 1.5;
  const homeGives = hk.pHomeWin >= 0.5;
  // Simple puck line: P(home wins by > 1.5) ≈ P(home reg win) × 0.75
  const pHomeCover = homeGives
    ? Math.max(0.05, Math.min(0.80, hk.pHomeRegWin * 0.75))
    : Math.max(0.20, Math.min(0.95, hk.pHomeWin + (1 - hk.pHomeWin) * 0.35));

  const spread = twoWayMarket({
    marketId: 'puck_line',
    marketType: 'SPREAD',
    name: 'Puck Line (±1.5)',
    category: 'spreads',
    line: puckLine,
    left: {
      id: `PuckLine:1 ${homeGives ? '-' : '+'}${puckLine}`,
      name: `${team1Name} ${homeGives ? '-' : '+'}${puckLine}`,
    },
    right: {
      id: `PuckLine:2 ${homeGives ? '+' : '-'}${puckLine}`,
      name: `${team2Name} ${homeGives ? '+' : '-'}${puckLine}`,
    },
    pLeft: pHomeCover,
    overround: totalsOo,
    houseBias: false,
    margins,
  });

  const totalLine = Math.round((hk.expectedTotal || 5.5) * 2) / 2;
  const ou = hk.calculateOverUnderProb(totalLine);

  const total = twoWayMarket({
    marketId: 'total_goals',
    marketType: 'TOTAL',
    name: 'Total Goals',
    category: 'totals',
    line: totalLine,
    left: { id: `Goals:Over ${totalLine}`, name: `Over ${totalLine}` },
    right: { id: `Goals:Under ${totalLine}`, name: `Under ${totalLine}` },
    pLeft: ou.pOver,
    overround: totalsOo,
    margins,
  });

  return [
    spread.status === 'OPEN'
      ? Object.freeze({ ...spread, bookPoints: bookPoints(spread.selections) })
      : spread,
    total.status === 'OPEN'
      ? Object.freeze({ ...total, bookPoints: bookPoints(total.selections) })
      : total,
  ];
}
