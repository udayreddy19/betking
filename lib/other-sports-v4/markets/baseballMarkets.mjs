/**
 * Baseball markets — moneyline, run line (±1.5), total runs O/U.
 */

import { exclusiveMarket, twoWayMarket, bookPoints } from '../book/helpers.mjs';
import { overroundForMarket, OSV4_MARGIN_CONFIG } from '../pricing/MarginPolicy.mjs';
import { withLiveBump } from '../book/houseProtect.mjs';
import { calculateBaseballProbabilities } from '../models/baseballModel.mjs';
import { readLiveScoreState } from '../state/readMatchState.mjs';
import { blendWinnerProbs } from '../providerBlend.mjs';

function readBaseballState(match) {
  const { score1, score2, minute } = readLiveScoreState(match);
  const inning = Number(match?.liveDetails?.inning) || Math.max(1, Math.floor(minute / 7) + 1);
  const isTopInning = match?.liveDetails?.isTopInning !== false;
  return { score1, score2, inning, isTopInning };
}

export function generateBaseballMatchWinner(match, team1Name, team2Name, margins = OSV4_MARGIN_CONFIG) {
  const { score1, score2, inning, isTopInning } = readBaseballState(match);
  const bb = calculateBaseballProbabilities({
    currentHomeScore: score1,
    currentAwayScore: score2,
    inning,
    isTopInning,
  });
  const blended = blendWinnerProbs({
    model: [bb.pHomeWin, bb.pAwayWin],
    hasDraw: false,
    match,
    providerWeight: margins.providerBlendWeight,
  });
  const overround = withLiveBump(overroundForMarket('winner', margins), match, margins);
  const market = exclusiveMarket({
    marketId: 'match_winner',
    marketType: 'MATCH_WINNER',
    name: 'Moneyline',
    category: 'main',
    outcomes: [
      { selectionId: '1', name: team1Name, probability: blended.p1 },
      { selectionId: '2', name: team2Name, probability: blended.p2 },
    ],
    overround,
    margins,
  });
  if (market.status === 'OPEN') {
    return Object.freeze({ ...market, bookPoints: bookPoints(market.selections), _bb: bb });
  }
  return Object.freeze({ ...market, _bb: bb });
}

export function generateBaseballExtras(match, team1Name, team2Name, winnerMarket, margins = OSV4_MARGIN_CONFIG) {
  const { score1, score2, inning, isTopInning } = readBaseballState(match);
  const bb = winnerMarket?._bb || calculateBaseballProbabilities({
    currentHomeScore: score1,
    currentAwayScore: score2,
    inning,
    isTopInning,
  });
  const totalsOo = withLiveBump(overroundForMarket('totals', margins), match, margins);

  const runLine = 1.5;
  const cover = bb.calculateSpreadCoverProb(runLine, bb.expectedSpread >= 0);
  const totalLine = Math.round((bb.expectedTotal || 8.5) * 2) / 2;
  const ou = bb.calculateOverUnderProb(totalLine);

  const spread = twoWayMarket({
    marketId: 'run_line',
    marketType: 'SPREAD',
    name: 'Run Line (±1.5)',
    category: 'spreads',
    line: runLine,
    left: {
      id: `RunLine:1 ${bb.expectedSpread >= 0 ? '-' : '+'}${runLine}`,
      name: `${team1Name} ${bb.expectedSpread >= 0 ? '-' : '+'}${runLine}`,
    },
    right: {
      id: `RunLine:2 ${bb.expectedSpread >= 0 ? '+' : '-'}${runLine}`,
      name: `${team2Name} ${bb.expectedSpread >= 0 ? '+' : '-'}${runLine}`,
    },
    pLeft: cover.pHomeCover,
    overround: totalsOo,
    houseBias: false,
    margins,
  });

  const total = twoWayMarket({
    marketId: 'total_runs',
    marketType: 'TOTAL',
    name: 'Total Runs',
    category: 'totals',
    line: totalLine,
    left: { id: `Runs:Over ${totalLine}`, name: `Over ${totalLine}` },
    right: { id: `Runs:Under ${totalLine}`, name: `Under ${totalLine}` },
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
