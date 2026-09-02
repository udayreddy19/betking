import { createMarketDefinition } from '../models/MarketDefinition.mjs';
import { calculateScoreMatrix } from '../models/soccerDixonColesModel.mjs';
import { readLiveScoreState } from './readLiveScoreState.mjs';
import { clampProb, priced, twoWayMarket } from './bookHelpers.mjs';

export function generateSoccerBook(match, { team1Name, team2Name, winner, overround }) {
  const { score1, score2, live, minute } = readLiveScoreState(match);
  const totalGoals = score1 + score2;
  const p1 = winner.selections.find((s) => s.selectionId === '1')?.probability || 0.4;
  const p2 = winner.selections.find((s) => s.selectionId === '2')?.probability || 0.3;
  const pDraw = winner.selections.find((s) => s.selectionId === 'X')?.probability || 0.28;
  const markets = [];

  const soccerMatrix = calculateScoreMatrix({
    currentHomeScore: score1,
    currentAwayScore: score2,
    minute,
    homeExpectedGoals: 1.45,
    awayExpectedGoals: 1.15,
  });

  const bothScored = score1 > 0 && score2 > 0;
  markets.push(twoWayMarket({
    marketId: 'btts',
    marketType: 'BTTS',
    name: 'Both Teams to Score',
    category: 'goals',
    left: { id: 'BTTS:Yes', name: 'Yes' },
    right: { id: 'BTTS:No', name: 'No' },
    pLeft: bothScored ? 0.99 : soccerMatrix.pBttsYes,
    overround,
  }));

  const goalLine = totalGoals >= 2 ? totalGoals + 1.5 : 2.5;
  markets.push(twoWayMarket({
    marketId: 'goals_line',
    marketType: 'TOTAL',
    name: `Total Goals Over/Under ${goalLine}`,
    category: 'goals',
    line: goalLine,
    left: { id: `Goals:Over ${goalLine}`, name: `Over ${goalLine}` },
    right: { id: `Goals:Under ${goalLine}`, name: `Under ${goalLine}` },
    pLeft: goalLine === 2.5
      ? soccerMatrix.pOver25
      : (live ? clampProb(0.55 - Math.max(0, totalGoals - goalLine + 1) * 0.12) : 0.52),
    overround,
  }));

  markets.push(createMarketDefinition({
    marketId: 'double_chance',
    marketType: 'DOUBLE_CHANCE',
    name: 'Double Chance',
    status: 'OPEN',
    category: 'chance',
    selections: [
      priced('DC:1X', `${team1Name} or Draw`, clampProb(p1 + pDraw), overround),
      priced('DC:12', `${team1Name} or ${team2Name}`, clampProb(p1 + p2), overround),
      priced('DC:X2', `Draw or ${team2Name}`, clampProb(pDraw + p2), overround),
    ],
  }));

  const rest = p1 + p2;
  markets.push(twoWayMarket({
    marketId: 'dnb',
    marketType: 'DRAW_NO_BET',
    name: 'Draw No Bet',
    category: 'chance',
    left: { id: 'DNB:1', name: team1Name },
    right: { id: 'DNB:2', name: team2Name },
    pLeft: rest > 0 ? p1 / rest : 0.5,
    overround,
  }));

  return markets;
}
