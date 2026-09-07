import {
  exclusiveMarket,
  twoWayMarket,
  doubleChanceMarket,
  doubleChanceAsBinaryMarkets,
  bookPoints,
} from '../book/helpers.mjs';
import { overroundForMarket, OSV4_MARGIN_CONFIG } from '../pricing/MarginPolicy.mjs';
import { withLiveBump } from '../book/houseProtect.mjs';
import { calculateScoreMatrix } from '../models/soccerDixonColes.mjs';
import { readLiveScoreState } from '../state/readMatchState.mjs';
import { blendWinnerProbs } from '../providerBlend.mjs';

export function generateSoccerMatchWinner(match, team1Name, team2Name, margins = OSV4_MARGIN_CONFIG) {
  const { score1, score2, minute } = readLiveScoreState(match);
  const matrix = calculateScoreMatrix({
    currentHomeScore: score1,
    currentAwayScore: score2,
    minute,
  });
  const blended = blendWinnerProbs({
    model: [matrix.pHomeWin, matrix.pDraw, matrix.pAwayWin],
    hasDraw: true,
    match,
    providerWeight: margins.providerBlendWeight,
  });
  const overround = withLiveBump(overroundForMarket('winner', margins), match, margins);
  return exclusiveMarket({
    marketId: 'match_winner',
    marketType: 'MATCH_WINNER',
    name: 'Full Time Result (1X2)',
    category: 'main',
    outcomes: [
      { selectionId: '1', name: team1Name, probability: blended.p1 },
      { selectionId: 'X', name: 'Draw', probability: blended.pDraw },
      { selectionId: '2', name: team2Name, probability: blended.p2 },
    ],
    overround,
    margins,
  });
}

export function generateSoccerExtras(match, team1Name, team2Name, winnerMarket, margins = OSV4_MARGIN_CONFIG) {
  const { score1, score2, minute } = readLiveScoreState(match);
  const matrix = calculateScoreMatrix({
    currentHomeScore: score1,
    currentAwayScore: score2,
    minute,
  });
  const p1 = winnerMarket?.selections?.find((s) => s.selectionId === '1')?.probability ?? matrix.pHomeWin;
  const pDraw = winnerMarket?.selections?.find((s) => s.selectionId === 'X')?.probability ?? matrix.pDraw;
  const p2 = winnerMarket?.selections?.find((s) => s.selectionId === '2')?.probability ?? matrix.pAwayWin;

  const propsOo = withLiveBump(overroundForMarket('props', margins), match, margins);
  const totalsOo = withLiveBump(overroundForMarket('totals', margins), match, margins);
  const winnerOo = withLiveBump(overroundForMarket('winner', margins), match, margins);

  const totalGoals = score1 + score2;
  const goalLine = totalGoals >= 2 ? totalGoals + 1.5 : 2.5;
  const pOver = goalLine === 2.5
    ? matrix.pOver25
    : matrix.pOverLine(goalLine);

  const bothScored = score1 > 0 && score2 > 0;
  const markets = [
    twoWayMarket({
      marketId: 'btts',
      marketType: 'BTTS',
      name: 'Both Teams to Score',
      category: 'goals',
      left: { id: 'BTTS:Yes', name: 'Yes' },
      right: { id: 'BTTS:No', name: 'No' },
      pLeft: bothScored ? 0.98 : matrix.pBttsYes,
      overround: propsOo,
      margins,
    }),
    twoWayMarket({
      marketId: 'goals_line',
      marketType: 'TOTAL',
      name: `Total Goals Over/Under ${goalLine}`,
      category: 'goals',
      line: goalLine,
      left: { id: `Goals:Over ${goalLine}`, name: `Over ${goalLine}` },
      right: { id: `Goals:Under ${goalLine}`, name: `Under ${goalLine}` },
      pLeft: pOver,
      overround: totalsOo,
      margins,
    }),
    ...doubleChanceAsBinaryMarkets({
      team1Name,
      team2Name,
      p1,
      pDraw,
      p2,
      overround: propsOo,
      margins,
    }),
    doubleChanceMarket({
      team1Name,
      team2Name,
      p1,
      pDraw,
      p2,
      overround: propsOo,
      margins,
    }),
    twoWayMarket({
      marketId: 'dnb',
      marketType: 'DRAW_NO_BET',
      name: 'Draw No Bet',
      category: 'chance',
      left: { id: 'DNB:1', name: team1Name },
      right: { id: 'DNB:2', name: team2Name },
      pLeft: (p1 + p2) > 0 ? p1 / (p1 + p2) : 0.5,
      overround: winnerOo,
      houseBias: false,
      margins,
    }),
  ];

  return markets.map((m) => {
    if (!m || m.status !== 'OPEN') return m;
    return Object.freeze({
      ...m,
      bookPoints: bookPoints(m.selections),
      ...(m.marketId === 'double_chance' ? { bookKind: 'overlapping' } : {}),
    });
  });
}
