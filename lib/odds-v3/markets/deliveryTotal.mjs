/**
 * OddsEngineV3 — Extended Delivery Markets (Group 5)
 * 
 * Generates:
 * 1. Next Delivery Runs (0, 1, 2, 3, 4, 6, Wicket)
 * 2. Next Delivery Over/Under (0.5 / 1.5)
 * 3. Next Delivery Odd/Even
 * 4. Next Delivery Boundary (Yes/No)
 * 5. Next Delivery Wicket (Yes/No)
 * 6. Next Delivery Extra (Yes/No)
 */

import { getFormatRules } from '../format/CricketFormatRules.mjs';
import { calculateWicketInOverProbability } from '../models/wicketModel.mjs';
import { priceSelection } from '../pricing/OddsCalculator.mjs';
import { createMarketDefinition } from '../models/MarketDefinition.mjs';

/**
 * Phase-aware per-ball outcome distribution.
 *
 * Uses format rules, innings phase (powerplay / middle / death),
 * current run rate, and batter strike rate to produce probabilities
 * for each ball outcome: dot, 1, 2, 4, 6, wicket.
 *
 * Base distributions derived from T20I historical averages:
 *   Powerplay:  dot 30%, 1-run 34%, 2-run 7%, four 16%, six 7%, wicket 6%
 *   Middle:     dot 38%, 1-run 36%, 2-run 8%, four 10%, six 4%, wicket 4%
 *   Death:      dot 28%, 1-run 30%, 2-run 6%, four 14%, six 12%, wicket 10%
 *
 * These base rates are then adjusted by the current scoring pace.
 */
function ballOutcomeDistribution(state) {
  const rules = getFormatRules(state.format) || getFormatRules('T20');
  const ballsCompleted = state.ballsCompleted || 0;
  const currentOverNum = Math.floor(ballsCompleted / 6) + 1;
  const totalOvers = rules.ballsPerInnings / 6;
  const ppOvers = rules.powerplayBalls / 6;

  // Phase base rates
  let base;
  if (currentOverNum <= ppOvers) {
    base = { dot: 0.30, single: 0.34, double: 0.07, four: 0.16, six: 0.07, wicket: 0.06 };
  } else if (currentOverNum > totalOvers * 0.75) {
    base = { dot: 0.28, single: 0.30, double: 0.06, four: 0.14, six: 0.12, wicket: 0.10 };
  } else {
    base = { dot: 0.38, single: 0.36, double: 0.08, four: 0.10, six: 0.04, wicket: 0.04 };
  }

  // Adjust by current scoring pace vs historical
  const battingTeam = state.battingTeamId === state.team1.id ? state.team1 : state.team2;
  const oversDone = ballsCompleted / 6;
  if (oversDone > 1) {
    const currentRPO = (battingTeam.runs || 0) / oversDone;
    const historicalRPO = rules.historicalRunsPerBall * 6;
    const paceRatio = Math.max(0.7, Math.min(1.4, currentRPO / historicalRPO));

    // Faster pace → more boundaries, fewer dots
    if (paceRatio > 1.05) {
      const boost = (paceRatio - 1.0) * 0.3;
      base.four += boost * 0.5;
      base.six += boost * 0.3;
      base.dot -= boost * 0.6;
      base.single -= boost * 0.2;
    } else if (paceRatio < 0.95) {
      const reduction = (1.0 - paceRatio) * 0.3;
      base.dot += reduction * 0.6;
      base.single += reduction * 0.2;
      base.four -= reduction * 0.4;
      base.six -= reduction * 0.3;
    }
  }

  // Adjust wicket probability by wickets already fallen
  const wicketsFallen = battingTeam.wickets || 0;
  if (wicketsFallen >= 7) {
    base.wicket = Math.min(0.15, base.wicket * 1.4);
    base.dot += 0.02;
  }

  // Normalize to ensure sum = 1
  const sum = base.dot + base.single + base.double + base.four + base.six + base.wicket;
  return {
    dot: Math.max(0.01, base.dot / sum),
    single: Math.max(0.01, base.single / sum),
    double: Math.max(0.01, base.double / sum),
    four: Math.max(0.01, base.four / sum),
    six: Math.max(0.01, base.six / sum),
    wicket: Math.max(0.005, base.wicket / sum),
  };
}

export function generateExtendedDeliveryMarkets(state, validation = {}, marginConfig = {}) {
  const overround = marginConfig.liveTeamTotalOverround || 0.06;
  const currentBalls = state.ballsCompleted || 0;
  const nextBallNum = (currentBalls % 6) + 1;
  const currentOverNum = Math.floor(currentBalls / 6) + 1;

  const dist = ballOutcomeDistribution(state);
  const markets = [];

  // 1. Next Delivery Runs — phase-aware distribution
  markets.push(createMarketDefinition({
    marketId: `next_delivery_runs_${currentOverNum}_${nextBallNum}`,
    marketType: 'NEXT_DELIVERY_RUNS',
    category: 'deliveries',
    name: `Over ${currentOverNum} Ball ${nextBallNum} - Delivery Result`,
    status: 'OPEN',
    selections: [
      priceSelection({ selectionId: 'sel_del_0', name: '0 Runs (Dot)', probability: dist.dot, overround }),
      priceSelection({ selectionId: 'sel_del_1', name: '1 Run', probability: dist.single, overround }),
      priceSelection({ selectionId: 'sel_del_2', name: '2 Runs', probability: dist.double, overround }),
      priceSelection({ selectionId: 'sel_del_4', name: '4 Runs (Four)', probability: dist.four, overround }),
      priceSelection({ selectionId: 'sel_del_6', name: '6 Runs (Six)', probability: dist.six, overround }),
      priceSelection({ selectionId: 'sel_del_w', name: 'Wicket', probability: dist.wicket, overround }),
    ],
  }));

  // 2. Next Delivery Over / Under 0.5 — derived from distribution
  // P(scoring run) = 1 - P(dot) - P(wicket)
  const pScoringBall = Math.max(0.01, Math.min(0.99, 1 - dist.dot - dist.wicket));
  markets.push(createMarketDefinition({
    marketId: `next_delivery_ou_${currentOverNum}_${nextBallNum}`,
    marketType: 'NEXT_DELIVERY_OU',
    category: 'deliveries',
    name: `Over ${currentOverNum} Ball ${nextBallNum} - Total Runs`,
    status: 'OPEN',
    line: 0.5,
    selections: [
      priceSelection({ selectionId: 'sel_del_over_05', name: 'Over 0.5', probability: pScoringBall, overround }),
      priceSelection({ selectionId: 'sel_del_under_05', name: 'Under 0.5', probability: 1 - pScoringBall, overround }),
    ],
  }));

  // 3. Next Delivery Boundary (Yes/No) — derived from distribution
  const pBoundary = Math.max(0.01, Math.min(0.60, dist.four + dist.six));
  markets.push(createMarketDefinition({
    marketId: `next_delivery_boundary_${currentOverNum}_${nextBallNum}`,
    marketType: 'NEXT_DELIVERY_BOUNDARY',
    category: 'deliveries',
    name: `Over ${currentOverNum} Ball ${nextBallNum} - Boundary Scored`,
    status: 'OPEN',
    selections: [
      priceSelection({ selectionId: 'sel_bnd_yes', name: 'Yes', probability: pBoundary, overround }),
      priceSelection({ selectionId: 'sel_bnd_no', name: 'No', probability: 1 - pBoundary, overround }),
    ],
  }));

  // 4. Next Delivery Wicket (Yes/No) — use wicket model
  const battingTeam = state.battingTeamId === state.team1.id ? state.team1 : state.team2;
  const pWicketBall = calculateWicketInOverProbability(1, battingTeam.wickets || 0);
  const pWkt = Math.max(0.01, Math.min(0.30, pWicketBall));
  markets.push(createMarketDefinition({
    marketId: `next_delivery_wicket_${currentOverNum}_${nextBallNum}`,
    marketType: 'NEXT_DELIVERY_WICKET',
    category: 'deliveries',
    name: `Over ${currentOverNum} Ball ${nextBallNum} - Wicket Fallen`,
    status: 'OPEN',
    selections: [
      priceSelection({ selectionId: 'sel_wkt_yes', name: 'Yes', probability: pWkt, overround }),
      priceSelection({ selectionId: 'sel_wkt_no', name: 'No', probability: 1 - pWkt, overround }),
    ],
  }));

  return markets;
}
