/**
 * OddsEngineV3 — non-cricket sports book dispatcher.
 *
 * Prices soccer, basketball, tennis, and other score sports from provider
 * winner odds when present. Model-only books are off unless
 * OTHER_SPORTS_MODEL_ODDS=1 (never in production).
 * Never generates cricket markets (overs, wickets, deliveries).
 */

import { createOddsSnapshot } from './models/OddsSnapshot.mjs';
import { createMarketDefinition } from './models/MarketDefinition.mjs';
import { priceExclusiveSelections } from './pricing/OddsCalculator.mjs';
import { DEFAULT_MARGIN_CONFIG } from './pricing/MarginCalculator.mjs';
import { extractProviderOdds } from './buildCanonicalFromMatch.mjs';
import { applyBookIntegrity } from './bookIntegrity.mjs';
import { calculateScoreMatrix } from './models/soccerDixonColesModel.mjs';
import { calculateTennisMatchProb } from './models/tennisMarkovModel.mjs';
import { calculateBasketballProbabilities } from './models/basketballPaceModel.mjs';
import { blendModelAndProvider } from './pricing/modelBlendEngine.mjs';
import { validateMarketSettlementCompatibility } from '../settlement/marketSettlementContract.mjs';
import {
  DRAW_SPORTS,
  isCricketSport,
  normalizeSportKey,
  sportAllowsDraw,
} from './sports/normalizeSportKey.mjs';
import { readLiveScoreState, isFinishedMatch } from './sports/readLiveScoreState.mjs';
import { teamName, normalizeProbs } from './sports/bookHelpers.mjs';
import { generateSoccerBook } from './sports/soccerBook.mjs';
import { generateBasketballBook } from './sports/basketballBook.mjs';
import { generateTennisBook, generateTableTennisBook } from './sports/tennisBook.mjs';
import {
  generateGenericTotal,
  generateKabaddiBook,
  generateVolleyballBook,
} from './sports/scoreSportsBook.mjs';

export { DRAW_SPORTS, isCricketSport, normalizeSportKey };

function winnerProbabilities(match, sport) {
  const provider = extractProviderOdds(match);
  const { score1, score2, live, minute, setWins1, setWins2 } = readLiveScoreState(match);
  const hasDraw = sportAllowsDraw(sport);

  let modelP1 = 0.45;
  let modelPDraw = hasDraw ? 0.25 : 0;
  let modelP2 = hasDraw ? 0.30 : 0.55;

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
  } else if (sport === 'tennis' || sport === 'table-tennis') {
    const tennis = calculateTennisMatchProb({
      setsA: setWins1,
      setsB: setWins2,
      gamesA: score1,
      gamesB: score2,
    });
    modelP1 = tennis.pWinA;
    modelP2 = tennis.pWinB;
  } else if (sport === 'basketball' || sport === 'american-football') {
    const bb = calculateBasketballProbabilities({
      currentHomeScore: score1,
      currentAwayScore: score2,
      minute: Math.min(sport === 'american-football' ? 60 : 48, minute || (live ? 24 : 0)),
    });
    modelP1 = bb.pHomeWin;
    modelP2 = bb.pAwayWin;
  }

  if (!provider) {
    if (hasDraw) {
      const [p1, pD, p2] = normalizeProbs([modelP1, modelPDraw, modelP2]);
      return { p1, pDraw: pD, p2, hasDraw: true };
    }
    const [p1, p2] = normalizeProbs([modelP1, modelP2]);
    return { p1, pDraw: null, p2, hasDraw: false };
  }

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
    const p1 = blend.outcomes.find((o) => o.selectionId === '1')?.blendedProb || modelP1;
    const pDraw = blend.outcomes.find((o) => o.selectionId === 'X')?.blendedProb || modelPDraw;
    const p2 = blend.outcomes.find((o) => o.selectionId === '2')?.blendedProb || modelP2;
    return { p1, pDraw, p2, hasDraw: true };
  }

  const blend = blendModelAndProvider({
    outcomes: [
      { selectionId: '1', name: 'Home', modelProb: modelP1, providerProb: 1 / provider.home },
      { selectionId: '2', name: 'Away', modelProb: modelP2, providerProb: 1 / provider.away },
    ],
    feedMetadata: { timestamp: match.fetchedAt || match.lastUpdated },
  });
  const p1 = blend.outcomes.find((o) => o.selectionId === '1')?.blendedProb || modelP1;
  const p2 = blend.outcomes.find((o) => o.selectionId === '2')?.blendedProb || modelP2;
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

function extraMarketsForSport(sport, match, team1Name, team2Name, winner, overround) {
  const ctx = { team1Name, team2Name, winner, overround };
  if (sport === 'soccer' || sport === 'esoccer') {
    return generateSoccerBook(match, ctx);
  }
  if (sport === 'basketball' || sport === 'american-football') {
    return generateBasketballBook(match, ctx);
  }
  if (sport === 'tennis') {
    return generateTennisBook(match, ctx);
  }
  if (sport === 'table-tennis') {
    return generateTableTennisBook(match, ctx);
  }
  if (sport === 'kabaddi') {
    return generateKabaddiBook(match, ctx);
  }
  if (sport === 'volleyball') {
    return generateVolleyballBook(match, ctx);
  }
  if (sport === 'hockey' || sport === 'rugby') {
    return [generateGenericTotal(match, overround)];
  }
  return [];
}

function allowModelOnlyOtherSports(config = {}) {
  if (config.allowModelOnly === true) return true;
  if (process.env.NODE_ENV === 'production') return false;
  return process.env.OTHER_SPORTS_MODEL_ODDS === '1' || process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
}

function settlementReadyMarkets(markets) {
  return markets.filter((m) => {
    if (!m?.marketId) return false;
    const compat = validateMarketSettlementCompatibility(m);
    return compat.compatible;
  });
}

/**
 * @param {object} match - aggregator / canonical match-like object
 * @param {{ winnerOnly?: boolean, margins?: object }} [config]
 */
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
  const extras = config.winnerOnly
    ? []
    : extraMarketsForSport(sport, match, team1Name, team2Name, winner, overround);

  const protectedMarkets = applyBookIntegrity(
    settlementReadyMarkets([winner, ...extras].filter(Boolean)),
  );
  const open = protectedMarkets.filter((m) => m?.status === 'OPEN');

  return createOddsSnapshot({
    matchId,
    stateVersion,
    status: open.length ? 'OK' : 'SUSPENDED',
    markets: protectedMarkets,
  });
}
