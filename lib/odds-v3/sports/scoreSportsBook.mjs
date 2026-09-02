import { readLiveScoreState } from './readLiveScoreState.mjs';
import { clampProb, twoWayMarket, suspendedMarket } from './bookHelpers.mjs';

export function generateGenericTotal(match, overround) {
  const { score1, score2, live } = readLiveScoreState(match);
  const current = score1 + score2;
  const line = live ? Math.max(current + 2.5, current + 0.5) : 5.5;
  return twoWayMarket({
    marketId: 'match_total',
    marketType: 'TOTAL',
    name: `Total Over/Under ${line}`,
    category: 'totals',
    line,
    left: { id: `Total:Over ${line}`, name: `Over ${line}` },
    right: { id: `Total:Under ${line}`, name: `Under ${line}` },
    pLeft: 0.51,
    overround,
  });
}

export function generateKabaddiBook(match, { overround }) {
  return [generateGenericTotal(match, overround)];
}

export function generateVolleyballBook(match, { team1Name, team2Name, winner, overround }) {
  const { hasSetScores, score1, score2, live } = readLiveScoreState(match);
  const p1 = winner.selections.find((s) => s.selectionId === '1')?.probability || 0.5;
  const setLine = live ? Math.max(3.5, score1 + score2 + 0.5) : 3.5;

  const setWinner = hasSetScores
    ? twoWayMarket({
      marketId: 'set1_winner',
      marketType: 'SET_WINNER',
      name: 'Set 1 Winner',
      category: 'sets',
      left: { id: 'Set1:1', name: team1Name },
      right: { id: 'Set1:2', name: team2Name },
      pLeft: clampProb(p1 * 0.92 + 0.04),
      overround,
    })
    : suspendedMarket({
      marketId: 'set1_winner',
      marketType: 'SET_WINNER',
      name: 'Set 1 Winner',
      category: 'sets',
    });

  return [
    setWinner,
    twoWayMarket({
      marketId: 'total_sets',
      marketType: 'TOTAL',
      name: `Total Sets Over/Under ${setLine}`,
      category: 'sets',
      line: setLine,
      left: { id: `Sets:Over ${setLine}`, name: `Over ${setLine}` },
      right: { id: `Sets:Under ${setLine}`, name: `Under ${setLine}` },
      pLeft: 0.51,
      overround,
    }),
  ];
}
