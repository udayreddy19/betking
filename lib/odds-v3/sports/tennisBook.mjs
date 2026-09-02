import { readLiveScoreState } from './readLiveScoreState.mjs';
import { clampProb, twoWayMarket, suspendedMarket } from './bookHelpers.mjs';

function setBook({ team1Name, team2Name, winner, overround, hasSetScores, totalLine, totalMarketId, totalName }) {
  const p1 = winner.selections.find((s) => s.selectionId === '1')?.probability || 0.5;
  const setStatus = hasSetScores ? 'OPEN' : 'SUSPENDED';
  const totalStatus = hasSetScores ? 'OPEN' : 'SUSPENDED';

  return [
    setStatus === 'SUSPENDED'
      ? suspendedMarket({
        marketId: 'set1_winner',
        marketType: 'SET_WINNER',
        name: 'Set 1 Winner',
        category: 'sets',
      })
      : twoWayMarket({
        marketId: 'set1_winner',
        marketType: 'SET_WINNER',
        name: 'Set 1 Winner',
        category: 'sets',
        left: { id: 'Set1:1', name: team1Name },
        right: { id: 'Set1:2', name: team2Name },
        pLeft: clampProb(p1 * 0.92 + 0.04),
        overround,
      }),
    totalStatus === 'SUSPENDED'
      ? suspendedMarket({
        marketId: totalMarketId,
        marketType: 'TOTAL',
        name: totalName,
        category: 'games',
        line: totalLine,
      })
      : twoWayMarket({
        marketId: totalMarketId,
        marketType: 'TOTAL',
        name: totalName,
        category: 'games',
        line: totalLine,
        left: { id: `Games:Over ${totalLine}`, name: `Over ${totalLine}` },
        right: { id: `Games:Under ${totalLine}`, name: `Under ${totalLine}` },
        pLeft: 0.51,
        overround,
      }),
  ];
}

export function generateTennisBook(match, { team1Name, team2Name, winner, overround }) {
  const { hasSetScores } = readLiveScoreState(match);
  return setBook({
    team1Name,
    team2Name,
    winner,
    overround,
    hasSetScores,
    totalLine: 21.5,
    totalMarketId: 'total_games',
    totalName: 'Total Match Games',
  });
}

export function generateTableTennisBook(match, { team1Name, team2Name, winner, overround }) {
  const { hasSetScores } = readLiveScoreState(match);
  return setBook({
    team1Name,
    team2Name,
    winner,
    overround,
    hasSetScores,
    totalLine: 69.5,
    totalMarketId: 'total_points',
    totalName: 'Total Match Points',
  });
}
