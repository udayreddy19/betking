import { exclusiveMarket, twoWayMarket, bookPoints } from '../book/helpers.mjs';
import { overroundForMarket, OSV4_MARGIN_CONFIG } from '../pricing/MarginPolicy.mjs';
import { withLiveBump } from '../book/houseProtect.mjs';
import { calculateBasketballProbabilities } from '../models/basketballPace.mjs';
import { calculateAmericanFootballProbabilities } from '../models/americanFootballDrive.mjs';
import { readLiveScoreState } from '../state/readMatchState.mjs';
import { blendWinnerProbs } from '../providerBlend.mjs';
import { normalizeSportKey } from '../../odds-v3/sports/normalizeSportKey.mjs';

function pickTotalLine(expectedTotal, currentPts, isNfl, live) {
  const base = isNfl ? 44.5 : 214.5;
  if (!live) {
    const raw = expectedTotal > 0 ? expectedTotal : base;
    return Math.round(raw * 2) / 2;
  }
  const projected = Math.max(expectedTotal, currentPts + (isNfl ? 14.5 : 40.5));
  return Math.round(projected * 2) / 2;
}

function pickSpreadLine(expectedSpread) {
  const abs = Math.max(1.5, Math.abs(Number(expectedSpread) || 0) || 3.5);
  return Math.round(abs * 2) / 2;
}

function paceModel(match, isNfl, score1, score2, minute, live, clockKnown) {
  // Unknown live clocks: price as late (less remaining mass), never mid-game forever.
  const fallbackLive = isNfl ? 50 : 40;
  const safeMinute = minute > 0
    ? minute
    : (live && !clockKnown ? fallbackLive : (live ? fallbackLive : 0));
  if (isNfl) {
    return calculateAmericanFootballProbabilities({
      currentHomeScore: score1,
      currentAwayScore: score2,
      minute: Math.min(60, safeMinute),
      totalGameMinutes: 60,
      expectedDrives: 22,
    });
  }
  return calculateBasketballProbabilities({
    currentHomeScore: score1,
    currentAwayScore: score2,
    minute: Math.min(48, safeMinute),
    totalGameMinutes: 48,
    expectedPace: 98,
  });
}

export function generateBasketballMatchWinner(match, team1Name, team2Name, margins = OSV4_MARGIN_CONFIG) {
  const sport = normalizeSportKey(match.sport);
  const isNfl = sport === 'american-football';
  const { score1, score2, minute, live, clockKnown } = readLiveScoreState(match);
  const bb = paceModel(match, isNfl, score1, score2, minute, live, clockKnown);
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
    name: 'Moneyline (incl. overtime)',
    category: 'main',
    outcomes: [
      { selectionId: '1', name: team1Name, probability: blended.p1 },
      { selectionId: '2', name: team2Name, probability: blended.p2 },
    ],
    overround,
    margins,
  });
  if (market.status === 'OPEN') {
    return Object.freeze({ ...market, bookPoints: bookPoints(market.selections), _pace: bb });
  }
  return Object.freeze({ ...market, _pace: bb });
}

export function generateBasketballExtras(match, team1Name, team2Name, winnerMarket, margins = OSV4_MARGIN_CONFIG) {
  const sport = normalizeSportKey(match.sport);
  const isNfl = sport === 'american-football';
  const { score1, score2, minute, live, clockKnown } = readLiveScoreState(match);
  const bb = winnerMarket?._pace || paceModel(match, isNfl, score1, score2, minute, live, clockKnown);

  const spreadLine = pickSpreadLine(bb.expectedSpread);
  const homeGives = bb.expectedSpread >= 0;
  const cover = bb.calculateSpreadCoverProb(spreadLine, homeGives);
  const totalLine = pickTotalLine(bb.expectedTotal, score1 + score2, isNfl, live);
  const ou = bb.calculateOverUnderProb(totalLine);
  const totalsOo = withLiveBump(overroundForMarket('totals', margins), match, margins);

  const spread = twoWayMarket({
    marketId: 'spread',
    marketType: 'SPREAD',
    name: 'Point Spread',
    category: 'spreads',
    line: spreadLine,
    left: {
      id: `Spread:1 ${homeGives ? '-' : '+'}${spreadLine}`,
      name: `${team1Name} ${homeGives ? '-' : '+'}${spreadLine}`,
    },
    right: {
      id: `Spread:2 ${homeGives ? '+' : '-'}${spreadLine}`,
      name: `${team2Name} ${homeGives ? '+' : '-'}${spreadLine}`,
    },
    pLeft: cover.pHomeCover,
    overround: totalsOo,
    houseBias: false,
    margins,
  });

  const total = twoWayMarket({
    marketId: 'total_pts',
    marketType: 'TOTAL',
    name: 'Total Match Points',
    category: 'totals',
    line: totalLine,
    left: { id: `Points:Over ${totalLine}`, name: `Over ${totalLine}` },
    right: { id: `Points:Under ${totalLine}`, name: `Under ${totalLine}` },
    pLeft: ou.pOver,
    overround: totalsOo,
    margins,
  });

  return [
    spread.status === 'OPEN'
      ? Object.freeze({ ...spread, bookPoints: bookPoints(spread.selections) })
      : spread,
    total.status === 'OPEN'
      ? Object.freeze({
        ...total,
        bookPoints: bookPoints(total.selections),
        expectedTotal: bb.expectedTotal,
      })
      : total,
  ];
}
