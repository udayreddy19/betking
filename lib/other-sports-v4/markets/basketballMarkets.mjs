import { exclusiveMarket, twoWayMarket, bookPoints } from '../book/helpers.mjs';
import { overroundForMarket, OSV4_MARGIN_CONFIG } from '../pricing/MarginPolicy.mjs';
import { withLiveBump } from '../book/houseProtect.mjs';
import { calculateBasketballProbabilities } from '../models/basketballPace.mjs';
import { calculateAmericanFootballProbabilities } from '../models/americanFootballDrive.mjs';
import { readLiveScoreState } from '../state/readMatchState.mjs';
import { blendWinnerProbs } from '../providerBlend.mjs';
import { normalizeSportKey } from '../../odds-v3/sports/normalizeSportKey.mjs';
import { extractProviderOdds } from '../../odds-v3/buildCanonicalFromMatch.mjs';

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

function inferTeamRatings(match, isNfl) {
  const provider = extractProviderOdds(match);
  if (!provider) return {};
  const pHome = 1 / Number(provider.home);
  const pAway = 1 / Number(provider.away);
  if (!Number.isFinite(pHome) || !Number.isFinite(pAway)) return {};
  const strength = (pHome - pAway) / (pHome + pAway);
  if (isNfl) {
    return {
      homePpg: 23.5 + strength * 6,
      awayPpg: 21.5 - strength * 6,
    };
  }
  return {
    homeOffensiveRating: 112 + strength * 8,
    awayOffensiveRating: 110 - strength * 8,
    homeDefensiveRating: 110 - strength * 4,
    awayDefensiveRating: 112 + strength * 4,
  };
}

function paceModel(match, isNfl, score1, score2, minute, live, clockKnown) {
  const fallbackLive = isNfl ? 50 : 40;
  const safeMinute = minute > 0
    ? minute
    : (live && !clockKnown ? fallbackLive : (live ? fallbackLive : 0));
  const teamRatings = inferTeamRatings(match, isNfl);
  if (isNfl) {
    return calculateAmericanFootballProbabilities({
      currentHomeScore: score1,
      currentAwayScore: score2,
      minute: Math.min(60, safeMinute),
      totalGameMinutes: 60,
      expectedDrives: 22,
      ...teamRatings,
    });
  }
  return calculateBasketballProbabilities({
    currentHomeScore: score1,
    currentAwayScore: score2,
    minute: Math.min(48, safeMinute),
    totalGameMinutes: 48,
    expectedPace: 98,
    ...teamRatings,
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
    name: isNfl ? 'Moneyline (incl. overtime)' : 'Moneyline (incl. overtime)',
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
  const winnerOo = withLiveBump(overroundForMarket('winner', margins), match, margins);

  const extras = [
    twoWayMarket({
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
    }),
    twoWayMarket({
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
    }),
  ];

  // 1st Half Winner — only before halftime
  const htMinute = isNfl ? 30 : 24;
  if (minute < htMinute) {
    const htModel = paceModel(match, isNfl, score1, score2, minute, live, clockKnown);
    extras.push(twoWayMarket({
      marketId: 'first_half_winner',
      marketType: 'FIRST_HALF_WINNER',
      name: '1st Half Winner',
      category: 'halves',
      left: { id: 'H1:1', name: team1Name },
      right: { id: 'H1:2', name: team2Name },
      pLeft: htModel.pHomeWin,
      overround: winnerOo,
      houseBias: false,
      margins,
    }));

    // 1st Half Total Points
    const htTotalLine = Math.round((bb.expectedTotal / 2 + 0.5) * 2) / 2;
    const htOu = bb.calculateOverUnderProb(htTotalLine);
    extras.push(twoWayMarket({
      marketId: 'first_half_total',
      marketType: 'TOTAL',
      name: '1st Half Total Points',
      category: 'halves',
      line: htTotalLine,
      left: { id: `H1:Over ${htTotalLine}`, name: `Over ${htTotalLine}` },
      right: { id: `H1:Under ${htTotalLine}`, name: `Under ${htTotalLine}` },
      pLeft: Math.max(0.25, Math.min(0.75, htOu.pOver * 0.9 + 0.05)),
      overround: totalsOo,
      margins,
    }));
  }

  // Winning Margin bands — derived from coherent score differential distribution
  if (minute < (isNfl ? 50 : 40)) {
    const wm = bb.winningMargins || {
      'WM:1-5': 0.28,
      'WM:6-10': 0.25,
      'WM:11-15': 0.18,
      'WM:16+': 0.15,
      'WM:draw': 0.14,
    };
    const bands = [
      { id: 'WM:1-5', name: '1-5 points', probability: wm['WM:1-5'] },
      { id: 'WM:6-10', name: '6-10 points', probability: wm['WM:6-10'] },
      { id: 'WM:11-15', name: '11-15 points', probability: wm['WM:11-15'] },
      { id: 'WM:16+', name: '16+ points', probability: wm['WM:16+'] },
      { id: 'WM:draw', name: 'Draw (overtime)', probability: wm['WM:draw'] },
    ];
    extras.push(exclusiveMarket({
      marketId: 'winning_margin',
      marketType: 'WINNING_MARGIN',
      name: 'Winning Margin',
      category: 'margin',
      outcomes: bands,
      overround: winnerOo + 0.06,
      margins,
    }));
  }

  return extras.map((m) => {
    if (!m || m.status !== 'OPEN') return m;
    return Object.freeze({
      ...m,
      bookPoints: bookPoints(m.selections),
      ...(m.marketId === 'total_pts' ? { expectedTotal: bb.expectedTotal } : {}),
    });
  });
}
