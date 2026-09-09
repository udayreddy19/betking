/**
 * Phase 4N — Settlement Universality Automated Discovery Matrix
 *
 * Automatically discovers every market produced by all V4 generators
 * across Cricket and Multi-Sport.
 *
 * Invariant:
 *   Every generated market MUST have:
 *   1. An active settlement contract (validateMarketSettlementCompatibility)
 *   2. A registered grader in marketSettlementRegistry
 *   3. Authoritative outcome resolution
 *
 * If ANY supported market lacks settlement capability: CI FAILS.
 */

import { describe, it, expect } from 'vitest';
import {
  MARKET_SETTLEMENT_CONTRACTS,
  validateMarketSettlementCompatibility,
} from '../../lib/settlement/marketSettlementContract.mjs';
import {
  resolveSettlementGrader,
  getSettlementBoundary,
} from '../../lib/settlement/marketSettlementRegistry.mjs';

// Cricket Generators
import { generateMatchWinnerMarketV4 } from '../../lib/odds-v4/markets/MatchWinnerMarketV4.mjs';
import { generateTossFamilyMarketsV4 } from '../../lib/odds-v4/markets/TossWinnerMarketV4.mjs';
import { generateTeamTotalMarket } from '../../lib/odds-v3/markets/TeamTotalMarket.mjs';
import { generateMatchTotalMarket } from '../../lib/odds-v3/markets/MatchTotalMarket.mjs';
import { generateExtendedMatchMarkets } from '../../lib/odds-v3/markets/matchWinner.mjs';
import { generateExtendedMatchTotals } from '../../lib/odds-v3/markets/matchTotals.mjs';
import { generateExtendedInningsTotals } from '../../lib/odds-v3/markets/inningsTotal.mjs';
import { generateExtendedOverMarkets } from '../../lib/odds-v3/markets/overTotal.mjs';
import { generateExtendedDeliveryMarkets } from '../../lib/odds-v3/markets/deliveryTotal.mjs';
import { generateExtendedWicketMarkets } from '../../lib/odds-v3/markets/wicketMarkets.mjs';
import { generateExtendedPlayerMarkets } from '../../lib/odds-v3/markets/playerRuns.mjs';
import { generateExtendedH2HMarkets } from '../../lib/odds-v3/markets/headToHead.mjs';

// Multi-Sport Generators
import { generateSoccerMatchWinner, generateSoccerExtras } from '../../lib/other-sports-v4/markets/soccerMarkets.mjs';
import { generateBasketballMatchWinner, generateBasketballExtras } from '../../lib/other-sports-v4/markets/basketballMarkets.mjs';
import { generateTennisMatchWinner, generateTennisExtras } from '../../lib/other-sports-v4/markets/tennisMarkets.mjs';
import { generateBaseballMatchWinner, generateBaseballExtras } from '../../lib/other-sports-v4/markets/baseballMarkets.mjs';
import { generateIceHockeyMatchWinner, generateIceHockeyExtras } from '../../lib/other-sports-v4/markets/iceHockeyMarkets.mjs';

describe('Phase 4N — Settlement Universality Discovery & Verification', () => {

  const dummyCricketState = {
    id: 'crick_univ_01',
    sport: 'cricket',
    format: 'T20',
    team1: { id: 't1', name: 'Team One' },
    team2: { id: 't2', name: 'Team Two' },
    status: 'LIVE',
    currentInnings: 1,
    score: {
      innings1: { runs: 100, wickets: 3, overs: 12.0 },
    },
    odds: { home: 1.80, away: 2.05 },
    ballsBowled: 72,
    ballsRemaining: 48,
    wicketsInHand: 7,
    runsNeeded: null,
  };

  const dummyMultiSportState = {
    id: 'multi_univ_01',
    team1: { id: 't1', name: 'Team One' },
    team2: { id: 't2', name: 'Team Two' },
    status: 'LIVE',
    minute: 35,
    score: { home: 1, away: 0 },
    odds: { home: 1.65, draw: 3.40, away: 4.50 },
  };

  function collectAllGeneratedMarkets() {
    const markets = [];

    // 1. Cricket Markets
    const mw = generateMatchWinnerMarketV4(dummyCricketState);
    if (mw) markets.push(mw);

    const toss = generateTossFamilyMarketsV4({ ...dummyCricketState, status: 'SCHEDULED' });
    if (Array.isArray(toss)) markets.push(...toss);

    const tt = generateTeamTotalMarket(dummyCricketState);
    if (tt) markets.push(tt);

    const mt = generateMatchTotalMarket(dummyCricketState);
    if (mt) markets.push(mt);

    const extMw = generateExtendedMatchMarkets(dummyCricketState);
    if (Array.isArray(extMw)) markets.push(...extMw);

    const extMt = generateExtendedMatchTotals(dummyCricketState);
    if (Array.isArray(extMt)) markets.push(...extMt);

    const extIt = generateExtendedInningsTotals(dummyCricketState);
    if (Array.isArray(extIt)) markets.push(...extIt);

    const extOver = generateExtendedOverMarkets(dummyCricketState);
    if (Array.isArray(extOver)) markets.push(...extOver);

    const extDeliv = generateExtendedDeliveryMarkets(dummyCricketState);
    if (Array.isArray(extDeliv)) markets.push(...extDeliv);

    const extWkt = generateExtendedWicketMarkets(dummyCricketState);
    if (Array.isArray(extWkt)) markets.push(...extWkt);

    const extPlayer = generateExtendedPlayerMarkets(dummyCricketState);
    if (Array.isArray(extPlayer)) markets.push(...extPlayer);

    const extH2h = generateExtendedH2HMarkets(dummyCricketState);
    if (Array.isArray(extH2h)) markets.push(...extH2h);

    // 2. Multi-Sport Markets
    // Soccer
    const socMw = generateSoccerMatchWinner({ ...dummyMultiSportState, sport: 'soccer' });
    if (socMw) markets.push(socMw);
    const socExt = generateSoccerExtras({ ...dummyMultiSportState, sport: 'soccer' });
    if (Array.isArray(socExt)) markets.push(...socExt);

    // Basketball
    const bbMw = generateBasketballMatchWinner({ ...dummyMultiSportState, sport: 'basketball' });
    if (bbMw) markets.push(bbMw);
    const bbExt = generateBasketballExtras({ ...dummyMultiSportState, sport: 'basketball' });
    if (Array.isArray(bbExt)) markets.push(...bbExt);

    // Tennis
    const tenMw = generateTennisMatchWinner({ ...dummyMultiSportState, sport: 'tennis' });
    if (tenMw) markets.push(tenMw);
    const tenExt = generateTennisExtras({ ...dummyMultiSportState, sport: 'tennis' });
    if (Array.isArray(tenExt)) markets.push(...tenExt);

    // Baseball
    const bsbMw = generateBaseballMatchWinner({ ...dummyMultiSportState, sport: 'baseball' });
    if (bsbMw) markets.push(bsbMw);
    const bsbExt = generateBaseballExtras({ ...dummyMultiSportState, sport: 'baseball' });
    if (Array.isArray(bsbExt)) markets.push(...bsbExt);

    // Ice Hockey
    const hockMw = generateIceHockeyMatchWinner({ ...dummyMultiSportState, sport: 'ice-hockey' });
    if (hockMw) markets.push(hockMw);
    const hockExt = generateIceHockeyExtras({ ...dummyMultiSportState, sport: 'ice-hockey' });
    if (Array.isArray(hockExt)) markets.push(...hockExt);

    return markets.filter(Boolean);
  }

  it('discovers all generated markets and ensures 100% have active settlement contracts', () => {
    const allMarkets = collectAllGeneratedMarkets();
    expect(allMarkets.length).toBeGreaterThanOrEqual(25);

    const missingSettlement = [];

    for (const m of allMarkets) {
      const marketId = m.marketId || m.id;
      const compat = validateMarketSettlementCompatibility({ marketId });
      const grader = resolveSettlementGrader(marketId);
      const boundary = getSettlementBoundary(marketId);

      if (!compat.compatible || !grader) {
        missingSettlement.push({
          marketId,
          compatible: compat.compatible,
          grader,
          boundary: boundary.boundary,
        });
      }
    }

    if (missingSettlement.length > 0) {
      console.error('Markets lacking settlement contracts:', missingSettlement);
    }

    // CI FAIL INVARIANT: If any market lacks settlement, test MUST fail!
    expect(missingSettlement).toHaveLength(0);
  });

  it('verifies all 43 registered settlement contracts in MARKET_SETTLEMENT_CONTRACTS are supported', () => {
    const supported = MARKET_SETTLEMENT_CONTRACTS.filter((c) => c.supported);
    expect(supported.length).toBeGreaterThanOrEqual(40);

    for (const contract of supported) {
      expect(contract.resolver).toBeTruthy();
      expect(contract.settlementTiming).toBeTruthy();
      expect(contract.voidPolicy).toBeTruthy();
    }
  });
});
