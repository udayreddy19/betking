import { exclusiveMarket, twoWayMarket, suspendedMarket, bookPoints } from '../book/helpers.mjs';
import { overroundForMarket, OSV4_MARGIN_CONFIG } from '../pricing/MarginPolicy.mjs';
import { withLiveBump } from '../book/houseProtect.mjs';
import { calculateTennisMatchProb } from '../models/tennisMarkov.mjs';
import { readLiveScoreState } from '../state/readMatchState.mjs';
import { blendWinnerProbs } from '../providerBlend.mjs';

export function generateTennisMatchWinner(match, team1Name, team2Name, margins = OSV4_MARGIN_CONFIG) {
  const { score1, score2, setWins1, setWins2 } = readLiveScoreState(match);
  const tennis = calculateTennisMatchProb({
    setsA: setWins1,
    setsB: setWins2,
    gamesA: score1,
    gamesB: score2,
  });
  const blended = blendWinnerProbs({
    model: [tennis.pWinA, tennis.pWinB],
    hasDraw: false,
    match,
    providerWeight: margins.providerBlendWeight,
  });
  const overround = withLiveBump(overroundForMarket('winner', margins), match, margins);
  const market = exclusiveMarket({
    marketId: 'match_winner',
    marketType: 'MATCH_WINNER',
    name: 'Match Winner',
    category: 'main',
    outcomes: [
      { selectionId: '1', name: team1Name, probability: blended.p1 },
      { selectionId: '2', name: team2Name, probability: blended.p2 },
    ],
    overround,
    margins,
  });
  if (market.status === 'OPEN') {
    return Object.freeze({ ...market, bookPoints: bookPoints(market.selections), _tennis: tennis });
  }
  return Object.freeze({ ...market, _tennis: tennis });
}

export function generateTennisExtras(match, team1Name, team2Name, winnerMarket, margins = OSV4_MARGIN_CONFIG) {
  const { hasSetScores, score1, score2, setWins1, setWins2 } = readLiveScoreState(match);
  const tennis = winnerMarket?._tennis || calculateTennisMatchProb({
    setsA: setWins1,
    setsB: setWins2,
    gamesA: score1,
    gamesB: score2,
  });
  const p1 = winnerMarket?.selections?.find((s) => s.selectionId === '1')?.probability ?? tennis.pWinA;
  const winnerOo = withLiveBump(overroundForMarket('winner', margins), match, margins);
  const totalsOo = withLiveBump(overroundForMarket('totals', margins), match, margins);

  if (!hasSetScores) {
    return [
      suspendedMarket({
        marketId: 'set1_winner',
        marketType: 'SET_WINNER',
        name: 'Set 1 Winner',
        category: 'sets',
      }),
      suspendedMarket({
        marketId: 'total_games',
        marketType: 'TOTAL',
        name: 'Total Match Games',
        category: 'games',
        line: 21.5,
      }),
    ];
  }

  const set1Raw = twoWayMarket({
    marketId: 'set1_winner',
    marketType: 'SET_WINNER',
    name: 'Set 1 Winner',
    category: 'sets',
    left: { id: 'Set1:1', name: team1Name },
    right: { id: 'Set1:2', name: team2Name },
    pLeft: Math.max(0.05, Math.min(0.95, tennis.pSetA ?? (p1 * 0.92 + 0.04))),
    overround: winnerOo,
    houseBias: false,
    margins,
  });

  const totalLine = 21.5;
  const pOver = Math.max(0.35, Math.min(0.65, 0.50 + (0.5 - p1) * 0.08));
  const totalRaw = twoWayMarket({
    marketId: 'total_games',
    marketType: 'TOTAL',
    name: 'Total Match Games',
    category: 'games',
    line: totalLine,
    left: { id: `Games:Over ${totalLine}`, name: `Over ${totalLine}` },
    right: { id: `Games:Under ${totalLine}`, name: `Under ${totalLine}` },
    pLeft: pOver,
    overround: totalsOo,
    margins,
  });

  const set1 = set1Raw.status === 'OPEN'
    ? Object.freeze({ ...set1Raw, bookPoints: bookPoints(set1Raw.selections) })
    : set1Raw;
  const total = totalRaw.status === 'OPEN'
    ? Object.freeze({ ...totalRaw, bookPoints: bookPoints(totalRaw.selections) })
    : totalRaw;
  return [set1, total];
}
