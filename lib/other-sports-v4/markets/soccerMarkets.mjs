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
import { extractProviderOdds } from '../../odds-v3/buildCanonicalFromMatch.mjs';

function providerImplied(match) {
  const provider = extractProviderOdds(match);
  if (!provider) return {};
  return {
    providerImpliedHome: 1 / Number(provider.home),
    providerImpliedAway: 1 / Number(provider.away),
  };
}

export function generateSoccerMatchWinner(match, team1Name, team2Name, margins = OSV4_MARGIN_CONFIG) {
  const { score1, score2, minute } = readLiveScoreState(match);
  const matrix = calculateScoreMatrix({
    currentHomeScore: score1,
    currentAwayScore: score2,
    minute,
    ...providerImplied(match),
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
    ...providerImplied(match),
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

  // Half-Time Markets — only before HT whistle
  if (minute < 45) {
    const htMatrix = calculateScoreMatrix({
      homeExpectedGoals: 0.72,
      awayExpectedGoals: 0.58,
      currentHomeScore: score1,
      currentAwayScore: score2,
      minute,
      isFirstHalfOnly: true,
      ...providerImplied(match),
    });

    markets.push(exclusiveMarket({
      marketId: 'ht_result',
      marketType: 'HALF_TIME_RESULT',
      name: 'Half-Time Result',
      category: 'halves',
      outcomes: [
        { selectionId: 'HT:1', name: team1Name, probability: htMatrix.pHomeWin },
        { selectionId: 'HT:X', name: 'Draw', probability: htMatrix.pDraw },
        { selectionId: 'HT:2', name: team2Name, probability: htMatrix.pAwayWin },
      ],
      overround: winnerOo,
      maxOdds: 25.0,
      margins,
    }));

    markets.push(exclusiveMarket({
      marketId: 'first_half_winner',
      marketType: 'HALF_TIME_RESULT',
      name: 'First Half Winner',
      category: 'halves',
      outcomes: [
        { selectionId: '1', name: team1Name, probability: htMatrix.pHomeWin },
        { selectionId: 'X', name: 'Draw', probability: htMatrix.pDraw },
        { selectionId: '2', name: team2Name, probability: htMatrix.pAwayWin },
      ],
      overround: winnerOo,
      maxOdds: 25.0,
      margins,
    }));

    markets.push(twoWayMarket({
      marketId: 'first_half_total',
      marketType: 'TOTAL',
      name: 'First Half Total Goals Over/Under 1.5',
      category: 'halves',
      line: 1.5,
      left: { id: 'Total:Over 1.5', name: 'Over 1.5' },
      right: { id: 'Total:Under 1.5', name: 'Under 1.5' },
      pLeft: htMatrix.pOverLine(1.5),
      overround: totalsOo,
      margins,
    }));
  }

  // Correct Score — derived strictly from bivariate Poisson matrix + explicit tail
  if (minute < 75) {
    const candidateLines = [
      { h: score1, a: score2 },
      { h: score1 + 1, a: score2 },
      { h: score1 + 2, a: score2 },
      { h: score1 + 2, a: score2 + 1 },
      { h: score1 + 3, a: score2 },
      { h: score1 + 1, a: score2 + 1 },
      { h: score1 + 2, a: score2 + 2 },
      { h: score1, a: score2 + 1 },
      { h: score1, a: score2 + 2 },
      { h: score1 + 1, a: score2 + 2 },
      { h: score1, a: score2 + 3 },
    ];

    let coveredMass = 0;
    const csOutcomes = candidateLines.map((tl) => {
      const p = Math.max(0.005, matrix.pFinalScore(tl.h, tl.a));
      coveredMass += p;
      return {
        selectionId: `CS:${tl.h}-${tl.a}`,
        name: `${tl.h}-${tl.a}`,
        probability: p,
      };
    });

    // Explicit tail mass accounts for all other high-scoring outcomes
    const tailMass = Math.max(0.01, 1 - coveredMass);
    csOutcomes.push({
      selectionId: 'CS:Any_Other',
      name: 'Any Other Score',
      probability: tailMass,
    });

    markets.push(exclusiveMarket({
      marketId: 'correct_score',
      marketType: 'CORRECT_SCORE',
      name: 'Correct Score',
      category: 'score',
      outcomes: csOutcomes,
      overround: winnerOo + 0.10,
      maxOdds: 51.0,
      margins,
    }));
  }

  // Winning Margin — coherent with Match Winner
  if (minute < 80) {
    const wm = matrix.winningMargin;
    markets.push(exclusiveMarket({
      marketId: 'winning_margin',
      marketType: 'WINNING_MARGIN',
      name: 'Winning Margin',
      category: 'score',
      outcomes: [
        { selectionId: 'WM:H1', name: `${team1Name} by 1`, probability: wm.homeBy1 },
        { selectionId: 'WM:H2', name: `${team1Name} by 2`, probability: wm.homeBy2 },
        { selectionId: 'WM:H3+', name: `${team1Name} by 3+`, probability: wm.homeBy3Plus },
        { selectionId: 'WM:draw', name: 'Draw', probability: wm.draw },
        { selectionId: 'WM:A1', name: `${team2Name} by 1`, probability: wm.awayBy1 },
        { selectionId: 'WM:A2', name: `${team2Name} by 2`, probability: wm.awayBy2 },
        { selectionId: 'WM:A3+', name: `${team2Name} by 3+`, probability: wm.awayBy3Plus },
      ],
      overround: winnerOo + 0.08,
      maxOdds: 31.0,
      margins,
    }));
  }

  // First Team to Score — pre-match / early live only, derived from scoring hazards
  if (totalGoals === 0 && minute < 30) {
    const fts = matrix.firstToScore;
    markets.push(exclusiveMarket({
      marketId: 'first_to_score',
      marketType: 'FIRST_TO_SCORE',
      name: 'First Team to Score',
      category: 'goals',
      outcomes: [
        { selectionId: 'FTS:1', name: team1Name, probability: fts.home },
        { selectionId: 'FTS:2', name: team2Name, probability: fts.away },
        { selectionId: 'FTS:NoGoal', name: 'No Goal', probability: fts.noGoal },
      ],
      overround: winnerOo,
      maxOdds: 21.0,
      margins,
    }));
  }

  return markets.map((m) => {
    if (!m || m.status !== 'OPEN') return m;
    return Object.freeze({
      ...m,
      bookPoints: bookPoints(m.selections),
      ...(m.marketId === 'double_chance' ? { bookKind: 'overlapping' } : {}),
    });
  });
}
