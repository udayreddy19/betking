/**
 * OddsEngineV3 — non-cricket sports book.
 *
 * Prices soccer, basketball, tennis, and other score sports from provider
 * winner odds when present. Model-only books are off unless
 * OTHER_SPORTS_MODEL_ODDS=1 (never in production).
 * Never generates cricket markets (overs, wickets, deliveries).
 */

import { createOddsSnapshot } from './models/OddsSnapshot.mjs';
import { createMarketDefinition } from './models/MarketDefinition.mjs';
import { priceSelection, priceExclusiveSelections } from './pricing/OddsCalculator.mjs';
import { DEFAULT_MARGIN_CONFIG } from './pricing/MarginCalculator.mjs';
import { extractProviderOdds } from './buildCanonicalFromMatch.mjs';
import { applyBookIntegrity } from './bookIntegrity.mjs';
import { calculateScoreMatrix } from './models/soccerDixonColesModel.mjs';
import { calculateTennisMatchProb } from './models/tennisMarkovModel.mjs';
import { calculateBasketballProbabilities } from './models/basketballPaceModel.mjs';
import { blendModelAndProvider } from './pricing/modelBlendEngine.mjs';

const DRAW_SPORTS = new Set(['soccer', 'esoccer', 'hockey', 'rugby']);

export function isCricketSport(sport) {
  const s = String(sport || '').toLowerCase();
  return !s || s.includes('cricket');
}

export function normalizeSportKey(sport) {
  return String(sport || '')
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/\s+/g, '-');
}

function teamName(team, fallback) {
  if (team == null) return fallback;
  if (typeof team === 'string') return team;
  return team.name || team.shortName || fallback;
}

function num(value, fallback = 0) {
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampProb(p, lo = 0.03, hi = 0.94) {
  return Math.max(lo, Math.min(hi, p));
}

function normalizeProbs(values) {
  const safe = values.map((v) => Math.max(0.001, Number(v) || 0));
  const sum = safe.reduce((acc, v) => acc + v, 0);
  return safe.map((v) => v / sum);
}

function matchSeed(id) {
  return [...String(id || 'm')].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
}

function parseMinute(liveDetails = {}) {
  const raw = liveDetails.minute ?? liveDetails.clock ?? liveDetails.commentary ?? '';
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? Math.max(0, Math.min(120, n)) : 0;
}

function readScores(match) {
  const ld = match.liveDetails || {};
  const score1 = num(
    ld.score1 ?? match.score1 ?? match.team1?.runs ?? match.team1?.score,
    0,
  );
  const score2 = num(
    ld.score2 ?? match.score2 ?? match.team2?.runs ?? match.team2?.score,
    0,
  );
  return { score1, score2, liveDetails: ld };
}

function isFinishedMatch(match) {
  const status = String(match.matchState || match.status || '').toUpperCase();
  if (['POST', 'COMPLETED', 'FINISHED', 'DETERMINED', 'SETTLED'].includes(status)) {
    return true;
  }
  const time = String(match.time || '').toLowerCase();
  return time === 'ft' || time.includes('full time') || time.includes('completed');
}

function isLiveMatch(match) {
  if (isFinishedMatch(match)) return false;
  if (match.isLive === true) return true;
  const status = String(match.matchState || match.status || '').toUpperCase();
  return status === 'IN' || status === 'LIVE';
}

function priced(selectionId, name, probability, overround) {
  return priceSelection({
    selectionId,
    name,
    probability: clampProb(probability),
    overround,
  });
}

function twoWayMarket({
  marketId,
  marketType,
  name,
  category,
  line,
  left,
  right,
  pLeft,
  overround,
}) {
  const [p0, p1] = normalizeProbs([pLeft, 1 - pLeft]);
  const priced = priceExclusiveSelections([
    { selectionId: left.id, name: left.name, probability: p0 },
    { selectionId: right.id, name: right.name, probability: p1 },
  ], overround);
  if (priced.suspended) {
    return createMarketDefinition({
      marketId,
      marketType,
      name,
      status: 'SUSPENDED',
      line: line ?? null,
      category,
      selections: [],
    });
  }
  return createMarketDefinition({
    marketId,
    marketType,
    name,
    status: 'OPEN',
    line: line ?? null,
    category,
    selections: priced.selections,
  });
}

function winnerProbabilities(match, sport) {
  const provider = extractProviderOdds(match);
  const { score1, score2, liveDetails } = readScores(match);
  const live = isLiveMatch(match);
  const minute = parseMinute(liveDetails);
  const hasDraw = DRAW_SPORTS.has(sport);

  let modelP1 = 0.45;
  let modelPDraw = hasDraw ? 0.25 : 0;
  let modelP2 = hasDraw ? 0.30 : 0.55;

  // 1. Calculate Sport-Specific Model Probabilities
  if (sport === 'soccer' || sport === 'esoccer') {
    const soccer = calculateScoreMatrix({
      currentHomeScore: score1,
      currentAwayScore: score2,
      minute,
      homeExpectedGoals: 1.45,
      awayExpectedGoals: 1.15,
    });
    modelP1 = soccer.pHomeWin;
    modelPDraw = soccer.pDraw;
    modelP2 = soccer.pAwayWin;
  } else if (sport === 'tennis') {
    const setsA = num(liveDetails.sets1, 0);
    const setsB = num(liveDetails.sets2, 0);
    const tennis = calculateTennisMatchProb({
      setsA,
      setsB,
      gamesA: score1,
      gamesB: score2,
    });
    modelP1 = tennis.pWinA;
    modelP2 = tennis.pWinB;
  } else if (sport === 'basketball') {
    const bb = calculateBasketballProbabilities({
      currentHomeScore: score1,
      currentAwayScore: score2,
      minute: Math.min(48, minute || (live ? 24 : 0)),
    });
    modelP1 = bb.pHomeWin;
    modelP2 = bb.pAwayWin;
  }

  // 2. If no provider odds, use pure sport model
  if (!provider) {
    if (hasDraw) {
      const [p1, pD, p2] = normalizeProbs([modelP1, modelPDraw, modelP2]);
      return { p1, pDraw: pD, p2, hasDraw: true };
    }
    const [p1, p2] = normalizeProbs([modelP1, modelP2]);
    return { p1, pDraw: null, p2, hasDraw: false };
  }

  // 3. If provider odds present, apply Bayesian blending
  if (hasDraw) {
    const drawOdds = Number(provider.draw);
    const pD_prov = drawOdds > 1 ? 1 / drawOdds : 0.26;
    const blend = blendModelAndProvider({
      outcomes: [
        { selectionId: '1', name: 'Home', modelProb: modelP1, providerProb: 1 / provider.home },
        { selectionId: 'X', name: 'Draw', modelProb: modelPDraw, providerProb: pD_prov },
        { selectionId: '2', name: 'Away', modelProb: modelP2, providerProb: 1 / provider.away },
      ],
      feedMetadata: { timestamp: match.fetchedAt || match.lastUpdated },
    });
    const p1 = blend.outcomes.find(o => o.selectionId === '1')?.blendedProb || modelP1;
    const pDraw = blend.outcomes.find(o => o.selectionId === 'X')?.blendedProb || modelPDraw;
    const p2 = blend.outcomes.find(o => o.selectionId === '2')?.blendedProb || modelP2;
    return { p1, pDraw, p2, hasDraw: true };
  }

  const blend = blendModelAndProvider({
    outcomes: [
      { selectionId: '1', name: 'Home', modelProb: modelP1, providerProb: 1 / provider.home },
      { selectionId: '2', name: 'Away', modelProb: modelP2, providerProb: 1 / provider.away },
    ],
    feedMetadata: { timestamp: match.fetchedAt || match.lastUpdated },
  });
  const p1 = blend.outcomes.find(o => o.selectionId === '1')?.blendedProb || modelP1;
  const p2 = blend.outcomes.find(o => o.selectionId === '2')?.blendedProb || modelP2;
  return { p1, pDraw: null, p2, hasDraw: false };
}

function generateWinnerMarket(match, sport, team1Name, team2Name, overround) {
  const probs = winnerProbabilities(match, sport);
  if (!probs) {
    return createMarketDefinition({
      marketId: 'match_winner',
      marketType: 'MATCH_WINNER',
      name: 'Match Winner',
      status: 'SUSPENDED',
      category: 'main',
      selections: [],
    });
  }

  const { p1, pDraw, p2, hasDraw } = probs;
  if (hasDraw) {
    const priced = priceExclusiveSelections([
      { selectionId: '1', name: team1Name, probability: p1 },
      { selectionId: 'X', name: 'Draw', probability: pDraw },
      { selectionId: '2', name: team2Name, probability: p2 },
    ], overround);
    if (priced.suspended) {
      return createMarketDefinition({
        marketId: 'match_winner',
        marketType: 'MATCH_WINNER',
        name: 'Match Winner',
        status: 'SUSPENDED',
        category: 'main',
        selections: [],
      });
    }
    return createMarketDefinition({
      marketId: 'match_winner',
      marketType: 'MATCH_WINNER',
      name: sport === 'soccer' || sport === 'esoccer'
        ? 'Full Time Result (1X2)'
        : 'Match Winner',
      status: 'OPEN',
      category: 'main',
      selections: priced.selections,
    });
  }

  const priced = priceExclusiveSelections([
    { selectionId: '1', name: team1Name, probability: p1 },
    { selectionId: '2', name: team2Name, probability: p2 },
  ], overround);
  if (priced.suspended) {
    return createMarketDefinition({
      marketId: 'match_winner',
      marketType: 'MATCH_WINNER',
      name: 'Match Winner',
      status: 'SUSPENDED',
      category: 'main',
      selections: [],
    });
  }

  const title = sport === 'basketball' || sport === 'american-football'
    ? 'Moneyline (incl. overtime)'
    : 'Match Winner';

  return createMarketDefinition({
    marketId: 'match_winner',
    marketType: 'MATCH_WINNER',
    name: title,
    status: 'OPEN',
    category: 'main',
    selections: priced.selections,
  });
}

function generateSoccerExtras(match, team1Name, team2Name, winner, overround) {
  const { score1, score2 } = readScores(match);
  const live = isLiveMatch(match);
  const totalGoals = score1 + score2;
  const minute = parseMinute(match.liveDetails);
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
    pLeft: goalLine === 2.5 ? soccerMatrix.pOver25 : (live ? clampProb(0.55 - Math.max(0, totalGoals - goalLine + 1) * 0.12) : 0.52),
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

function generateBasketballExtras(match, team1Name, team2Name, overround) {
  const { score1, score2 } = readScores(match);
  const live = isLiveMatch(match);
  const diff = score1 - score2;
  const spreadLine = Math.max(1.5, Math.abs(diff) + 3.5);
  const currentPts = score1 + score2;
  const sport = normalizeSportKey(match.sport);
  const baseTotal = sport === 'american-football' ? 44.5 : 214.5;
  const totalLine = live
    ? (sport === 'american-football'
      ? Math.max(baseTotal, currentPts + 14.5)
      : Math.max(180.5, currentPts + 40.5))
    : baseTotal;
  const favoriteIsHome = diff >= 0;

  return [
    twoWayMarket({
      marketId: 'spread',
      marketType: 'SPREAD',
      name: 'Point Spread',
      category: 'spreads',
      line: spreadLine,
      left: { id: `Spread:1 -${spreadLine}`, name: `${team1Name} -${spreadLine}` },
      right: { id: `Spread:2 +${spreadLine}`, name: `${team2Name} +${spreadLine}` },
      pLeft: favoriteIsHome ? 0.52 : 0.48,
      overround,
    }),
    twoWayMarket({
      marketId: 'total_pts',
      marketType: 'TOTAL',
      name: sport === 'american-football' ? 'Total Match Points' : 'Total Match Points',
      category: 'totals',
      line: totalLine,
      left: { id: `Points:Over ${totalLine}`, name: `Over ${totalLine}` },
      right: { id: `Points:Under ${totalLine}`, name: `Under ${totalLine}` },
      pLeft: 0.51,
      overround,
    }),
  ];
}

function generateTennisExtras(team1Name, team2Name, winner, overround) {
  const p1 = winner.selections.find((s) => s.selectionId === '1')?.probability || 0.5;
  return [
    twoWayMarket({
      marketId: 'set1_winner',
      marketType: 'SET_WINNER',
      name: 'Set 1 Winner',
      category: 'sets',
      left: { id: 'Set1:1', name: team1Name },
      right: { id: 'Set1:2', name: team2Name },
      pLeft: clampProb(p1 * 0.92 + 0.04),
      overround,
    }),
    twoWayMarket({
      marketId: 'total_games',
      marketType: 'TOTAL',
      name: 'Total Match Games',
      category: 'games',
      line: 21.5,
      left: { id: 'Games:Over 21.5', name: 'Over 21.5 Games' },
      right: { id: 'Games:Under 21.5', name: 'Under 21.5 Games' },
      pLeft: 0.51,
      overround,
    }),
  ];
}

function generateGenericTotal(match, overround) {
  const { score1, score2 } = readScores(match);
  const live = isLiveMatch(match);
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

function extraMarketsForSport(sport, match, team1Name, team2Name, winner, overround) {
  if (sport === 'soccer' || sport === 'esoccer') {
    return generateSoccerExtras(match, team1Name, team2Name, winner, overround);
  }
  if (sport === 'basketball' || sport === 'american-football') {
    return generateBasketballExtras(match, team1Name, team2Name, overround);
  }
  if (sport === 'tennis' || sport === 'table-tennis') {
    return generateTennisExtras(team1Name, team2Name, winner, overround);
  }
  return [generateGenericTotal(match, overround)];
}

/**
 * @param {object} match - aggregator / canonical match-like object
 * @param {{ winnerOnly?: boolean, margins?: object }} [config]
 */
function allowModelOnlyOtherSports(config = {}) {
  if (config.allowModelOnly === true) return true;
  if (process.env.NODE_ENV === 'production') return false;
  return process.env.OTHER_SPORTS_MODEL_ODDS === '1';
}

export function generateOtherSportsSnapshot(match, config = {}) {
  const matchId = match?.matchId || match?.id || 'unknown';
  const stateVersion = Number(match?.stateVersion) || 0;
  const sport = normalizeSportKey(match?.sport);

  if (isFinishedMatch(match)) {
    return createOddsSnapshot({
      matchId,
      stateVersion,
      status: 'DETERMINED',
      markets: [],
    });
  }

  const provider = extractProviderOdds(match);
  if (!provider && !allowModelOnlyOtherSports(config)) {
    return createOddsSnapshot({
      matchId,
      stateVersion,
      status: 'NOT_AVAILABLE',
      markets: [],
    });
  }

  const overround = config.margins?.liveMatchWinnerOverround
    ?? DEFAULT_MARGIN_CONFIG.liveMatchWinnerOverround;
  const team1Name = teamName(match.team1, 'Team 1');
  const team2Name = teamName(match.team2, 'Team 2');

  const winner = generateWinnerMarket(match, sport, team1Name, team2Name, overround);
  const extras = (config.winnerOnly || !allowModelOnlyOtherSports(config))
    ? []
    : extraMarketsForSport(sport, match, team1Name, team2Name, winner, overround);

  const protectedMarkets = applyBookIntegrity([winner, ...extras].filter(Boolean));
  const open = protectedMarkets.filter((m) => m?.status === 'OPEN');

  return createOddsSnapshot({
    matchId,
    stateVersion,
    status: open.length ? 'OK' : 'SUSPENDED',
    markets: protectedMarkets,
  });
}
