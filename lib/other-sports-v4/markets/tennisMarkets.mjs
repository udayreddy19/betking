import { exclusiveMarket, twoWayMarket, suspendedMarket, bookPoints } from '../book/helpers.mjs';
import { overroundForMarket, OSV4_MARGIN_CONFIG } from '../pricing/MarginPolicy.mjs';
import { withLiveBump } from '../book/houseProtect.mjs';
import { calculateTennisMatchProb } from '../models/tennisMarkov.mjs';
import { readLiveScoreState } from '../state/readMatchState.mjs';
import { blendWinnerProbs } from '../providerBlend.mjs';
import { isCompletedTennisSet } from '../../odds-v3/sports/readLiveScoreState.mjs';
import { extractProviderOdds } from '../../odds-v3/buildCanonicalFromMatch.mjs';

function providerImpliedA(match) {
  const provider = extractProviderOdds(match);
  if (!provider) return null;
  const pHome = 1 / Number(provider.home);
  const pAway = 1 / Number(provider.away);
  if (!Number.isFinite(pHome) || !Number.isFinite(pAway)) return null;
  return pHome / (pHome + pAway);
}

export function generateTennisMatchWinner(match, team1Name, team2Name, margins = OSV4_MARGIN_CONFIG) {
  const { score1, score2, setWins1, setWins2, sets1, sets2 } = readLiveScoreState(match);
  let gamesA = score1;
  let gamesB = score2;
  const n = Math.min(sets1.length, sets2.length);
  if (n > 0 && !isCompletedTennisSet(sets1[n - 1], sets2[n - 1])) {
    gamesA = sets1[n - 1];
    gamesB = sets2[n - 1];
  }
  const bestOf = Number(match?.bestOfSets) || (match?.tournament?.type === 'grand_slam' ? 5 : 3);
  const tennis = calculateTennisMatchProb({
    setsA: setWins1,
    setsB: setWins2,
    gamesA,
    gamesB,
    bestOfSets: bestOf,
    providerImpliedA: providerImpliedA(match),
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
  const { hasSetScores, score1, score2, setWins1, setWins2, sets1, sets2 } = readLiveScoreState(match);
  const bestOf = Number(match?.bestOfSets) || (match?.tournament?.type === 'grand_slam' ? 5 : 3);
  const tennis = winnerMarket?._tennis || calculateTennisMatchProb({
    setsA: setWins1,
    setsB: setWins2,
    gamesA: score1,
    gamesB: score2,
    bestOfSets: bestOf,
    providerImpliedA: providerImpliedA(match),
  });
  const p1 = winnerMarket?.selections?.find((s) => s.selectionId === '1')?.probability ?? tennis.pWinA;
  const winnerOo = withLiveBump(overroundForMarket('winner', margins), match, margins);
  const totalsOo = withLiveBump(overroundForMarket('totals', margins), match, margins);

  const extras = [];

  if (!hasSetScores) {
    extras.push(
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
        line: bestOf === 5 ? 34.5 : 21.5,
      }),
    );
    return extras;
  }

  // Set 1 decided — suspend set1 market
  const set1Done = sets1.length > 0 && sets2.length > 0 && isCompletedTennisSet(sets1[0], sets2[0]);

  if (!set1Done) {
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
    extras.push(set1Raw.status === 'OPEN'
      ? Object.freeze({ ...set1Raw, bookPoints: bookPoints(set1Raw.selections) })
      : set1Raw);
  } else {
    extras.push(suspendedMarket({
      marketId: 'set1_winner',
      marketType: 'SET_WINNER',
      name: 'Set 1 Winner',
      category: 'sets',
    }));
  }

  // Total Match Games — use Markov expected games
  const totalLine = bestOf === 5
    ? Math.round(((tennis.expectedGames || 34.5) + 0.25) * 2) / 2
    : Math.round(((tennis.expectedGames || 21.5) + 0.25) * 2) / 2;
  const pOverGames = Math.max(0.25, Math.min(0.75,
    0.50 + (0.5 - p1) * 0.08 + ((tennis.expectedGames || totalLine) - totalLine) * 0.04,
  ));
  const totalRaw = twoWayMarket({
    marketId: 'total_games',
    marketType: 'TOTAL',
    name: 'Total Match Games',
    category: 'games',
    line: totalLine,
    left: { id: `Games:Over ${totalLine}`, name: `Over ${totalLine}` },
    right: { id: `Games:Under ${totalLine}`, name: `Under ${totalLine}` },
    pLeft: pOverGames,
    overround: totalsOo,
    margins,
  });
  extras.push(totalRaw.status === 'OPEN'
    ? Object.freeze({ ...totalRaw, bookPoints: bookPoints(totalRaw.selections) })
    : totalRaw);

  // Total Sets O/U — only meaningful for best-of-3 (line 2.5) or best-of-5 (line 3.5)
  const setsNeeded = Math.ceil(bestOf / 2);
  const totalSetsPlayed = setWins1 + setWins2;
  const maxRemainingSets = (setsNeeded - setWins1) + (setsNeeded - setWins2) - 1;
  if (maxRemainingSets >= 1 && totalSetsPlayed < bestOf) {
    const setsLine = bestOf === 5 ? 3.5 : 2.5;
    // P(>2.5 sets) ≈ chance of going to deciding set
    const pDecider = bestOf === 5
      ? Math.max(0.15, Math.min(0.85, 1 - Math.abs(tennis.pWinA - 0.5) * 2.5))
      : Math.max(0.15, Math.min(0.85, 1 - Math.abs(tennis.pWinA - 0.5) * 3.0));
    const totalSetsRaw = twoWayMarket({
      marketId: 'total_sets',
      marketType: 'TOTAL',
      name: `Total Sets Over/Under ${setsLine}`,
      category: 'sets',
      line: setsLine,
      left: { id: `Sets:Over ${setsLine}`, name: `Over ${setsLine}` },
      right: { id: `Sets:Under ${setsLine}`, name: `Under ${setsLine}` },
      pLeft: pDecider,
      overround: totalsOo,
      margins,
    });
    extras.push(totalSetsRaw.status === 'OPEN'
      ? Object.freeze({ ...totalSetsRaw, bookPoints: bookPoints(totalSetsRaw.selections) })
      : totalSetsRaw);
  }

  // Correct Score in Sets — e.g. 2-0, 2-1, 0-2, 1-2
  if (setWins1 + setWins2 === 0 && bestOf === 3) {
    const pStraightA = tennis.pSetA * tennis.pSetA;
    const pStraightB = (1 - tennis.pSetA) * (1 - tennis.pSetA);
    const p21 = tennis.pWinA > 0.01 ? Math.max(0.05, tennis.pWinA - pStraightA) : 0.15;
    const p12 = tennis.pWinB > 0.01 ? Math.max(0.05, tennis.pWinB - pStraightB) : 0.15;
    const csOutcomes = [
      { selectionId: 'SS:2-0', name: '2-0', probability: Math.max(0.05, pStraightA) },
      { selectionId: 'SS:2-1', name: '2-1', probability: Math.max(0.05, p21) },
      { selectionId: 'SS:0-2', name: '0-2', probability: Math.max(0.05, pStraightB) },
      { selectionId: 'SS:1-2', name: '1-2', probability: Math.max(0.05, p12) },
    ];
    const csRaw = exclusiveMarket({
      marketId: 'correct_set_score',
      marketType: 'CORRECT_SET_SCORE',
      name: 'Correct Score in Sets',
      category: 'sets',
      outcomes: csOutcomes,
      overround: winnerOo + 0.06,
      margins,
    });
    extras.push(csRaw.status === 'OPEN'
      ? Object.freeze({ ...csRaw, bookPoints: bookPoints(csRaw.selections) })
      : csRaw);
  }

  return extras;
}
