/**
 * OddsEngineV3 — Extended Match Totals (Group 2)
 * 
 * Generates:
 * 1. Total Match Runs Alternate Line
 * 2. Total Match Sixes
 * 3. Total Match Fours
 * 4. Total Match Wickets
 * 5. Match Run Range (e.g. 250-299, 300-349, 350+)
 * 6. Both Teams To Score 150+ / 175+ / 200+
 */

import { calculateScoringExpectation, expectedMatchRuns } from '../models/scoringModel.mjs';
import { calculateOverUnderProbability, calculateRangeProbability } from '../models/distributionModel.mjs';
import { priceSelection } from '../pricing/OddsCalculator.mjs';
import { createMarketDefinition } from '../models/MarketDefinition.mjs';
import { getFormatRules } from '../format/CricketFormatRules.mjs';
import {
  DEFAULT_MARGIN_CONFIG,
  MAX_LIVE_TOTAL_OVER_ODDS,
} from '../pricing/MarginCalculator.mjs';
import { applyLiveTotalOverOddsCap } from './TeamTotalMarket.mjs';
import {
  matchBoundaryCount,
  estimateExpectedBoundaries,
  buildLiveAggregateOuMarket,
} from './liveAggregatePricing.mjs';

/**
 * Live match wicket tally used for Total Match Wickets pricing/settlement alignment.
 * Caps each innings at maxWickets so mirrored all-out stamps cannot double-count.
 */
export function currentMatchWickets(state, maxWickets = 10) {
  const maxW = Number(maxWickets) > 0 ? Number(maxWickets) : 10;
  const t1 = Math.max(0, Math.min(maxW, Number(state?.team1?.wickets) || 0));
  const t2 = Math.max(0, Math.min(maxW, Number(state?.team2?.wickets) || 0));
  return t1 + t2;
}

/**
 * Expected final match wickets given live state.
 * Uses balls-remaining / format wicket rate for the current innings, plus a
 * typical second-innings load when still in innings 1.
 */
export function estimateExpectedMatchWickets(state, rules, currentWickets) {
  const maxW = rules?.maxWickets || 10;
  const current = Math.max(0, Number(currentWickets) || 0);
  const format = String(state?.format || '').toUpperCase();
  const ballsPerWicket = /ODI|LIST|ONE.?DAY|50/.test(format)
    ? 30
    : /TEST|FC|FIRST.?CLASS|4.?DAY/.test(format)
      ? 55
      : /T10|TEN10/.test(format)
        ? 12
        : 18;

  const battingTeam = state?.battingTeamId === state?.team1?.id ? state.team1 : state.team2;
  const batW = Math.max(0, Math.min(maxW, Number(battingTeam?.wickets) || 0));
  const wicketsInHand = Math.max(0, maxW - batW);
  const ballsRem = Math.max(0, Number(state?.ballsRemaining) || 0);

  let expectedMoreCurrent = Math.min(wicketsInHand, ballsRem / ballsPerWicket);
  // Short remaining windows: scale down rather than assume full rate.
  if (ballsRem > 0 && ballsRem < ballsPerWicket * 2) {
    expectedMoreCurrent = Math.min(
      expectedMoreCurrent,
      wicketsInHand * (ballsRem / (ballsPerWicket * 2)),
    );
  }
  if (ballsRem <= 0 || wicketsInHand <= 0) expectedMoreCurrent = 0;

  let expectedFutureInnings = 0;
  const inn = Number(state?.currentInnings) || 1;
  if (inn < 2) {
    expectedFutureInnings = /ODI|LIST|ONE.?DAY|50/.test(format)
      ? 6.2
      : /TEST|FC|FIRST.?CLASS/.test(format)
        ? 8
        : /T10|TEN10/.test(format)
          ? 4.2
          : 5.4;
  }

  return Math.max(current + 0.05, current + expectedMoreCurrent + expectedFutureInnings);
}

/** Poisson CDF P(X <= k) for small integer k (wicket remainders). */
function poissonCdfLeq(k, lambda) {
  const lam = Math.max(0, Number(lambda) || 0);
  if (k < 0) return 0;
  if (lam <= 0) return 1;
  let term = Math.exp(-lam);
  let sum = term;
  const kMax = Math.min(Math.floor(k), 40);
  for (let i = 1; i <= kMax; i += 1) {
    term *= lam / i;
    sum += term;
  }
  return Math.max(0, Math.min(1, sum));
}

export function generateExtendedMatchTotals(state, validation = {}, marginConfig = {}) {
  const overround = marginConfig.liveMatchTotalOverround
    ?? DEFAULT_MARGIN_CONFIG.liveMatchTotalOverround
    ?? 0.10;
  const overExtra = marginConfig.liveTotalsOverExtraOverround
    ?? DEFAULT_MARGIN_CONFIG.liveTotalsOverExtraOverround
    ?? 0;
  const maxOverOdds = marginConfig.maxLiveTotalOverOdds ?? MAX_LIVE_TOTAL_OVER_ODDS;
  const rules = getFormatRules(state.format) || getFormatRules('T20');
  const currentTotal = (state.team1.runs || 0) + (state.team2.runs || 0);
  const firstInningsOnly = (Number(state.currentInnings) || 1) < 2;

  const battingTeam = state.battingTeamId === state.team1.id ? state.team1 : state.team2;
  const fieldingTeam = state.bowlingTeamId === state.team1.id ? state.team1 : state.team2;

  const calc = calculateScoringExpectation({
    currentScore: battingTeam.runs || 0,
    ballsRemaining: state.ballsRemaining,
    wicketsRemaining: Math.max(1, rules.maxWickets - (battingTeam.wickets || 0)),
    ballsCompleted: state.ballsCompleted,
    format: state.format,
    target: state.target,
  });

  let expectedMatchTotal = expectedMatchRuns({
    currentInnings: state.currentInnings,
    expectedBattingTotal: calc.expectedTotal,
    firstInningsRuns: fieldingTeam.runs || 0,
    rules,
    currentCombined: currentTotal,
  });

  const mainLine = Math.floor(expectedMatchTotal) + 0.5;
  let altLine = Math.max(currentTotal + 5.5, mainLine - 20.0);
  if (state.currentInnings === 2 && state.target != null) {
    const maxLineAllowed = (fieldingTeam.runs || 0) + state.target + 2.5;
    altLine = Math.min(altLine, maxLineAllowed);
  }

  const isAltDetermined = currentTotal >= altLine;
  const markets = [];

  // 1. Alternate Match Total — first innings only (same as Total Match Runs)
  if (firstInningsOnly) {
  if (isAltDetermined) {
    markets.push(createMarketDefinition({
      marketId: 'match_total_alt',
      marketType: 'TOTAL_MATCH_RUNS_ALT',
      category: 'totals',
      name: 'Total Match Runs (Alternate Line)',
      status: 'SETTLED',
      line: altLine,
      selections: [
        { selectionId: 'sel_alt_over', name: `Over ${altLine}`, status: 'WON', bettable: false, odds: null, won: true },
        { selectionId: 'sel_alt_under', name: `Under ${altLine}`, status: 'LOST', bettable: false, odds: null, won: false },
      ],
    }));
  } else {
    const { pOver: pAltOver, pUnder: pAltUnder } = calculateOverUnderProbability(expectedMatchTotal, altLine, 1.5, currentTotal);
    let overSel = priceSelection({
      selectionId: 'sel_alt_over',
      name: `Over ${altLine}`,
      probability: pAltOver,
      overround: overround + overExtra,
    });
    let underSel = priceSelection({
      selectionId: 'sel_alt_under',
      name: `Under ${altLine}`,
      probability: pAltUnder,
      overround,
    });
    if (state.status === 'LIVE') {
      const capped = applyLiveTotalOverOddsCap(overSel, underSel, overround + overExtra, maxOverOdds);
      overSel = capped.overSel;
      underSel = capped.underSel;
    }
    markets.push(createMarketDefinition({
      marketId: 'match_total_alt',
      marketType: 'TOTAL_MATCH_RUNS_ALT',
      category: 'totals',
      name: 'Total Match Runs (Alternate Line)',
      status: 'OPEN',
      line: altLine,
      selections: [overSel, underSel],
    }));
  }
  }

  // 2–3. Total Match Sixes / Fours — live counts + remaining balls (never hardcode from runs only)
  const futureInningsBalls = firstInningsOnly ? (rules.ballsPerInnings || 0) : 0;
  const liveSixes = matchBoundaryCount(state, 'sixes');
  const liveFours = matchBoundaryCount(state, 'fours');
  const sixProj = estimateExpectedBoundaries({
    liveCount: liveSixes,
    currentScore: currentTotal,
    ballsRemaining: state.ballsRemaining,
    format: state.format,
    kind: 'sixes',
    futureInningsBalls,
  });
  const fourProj = estimateExpectedBoundaries({
    liveCount: liveFours,
    currentScore: currentTotal,
    ballsRemaining: state.ballsRemaining,
    format: state.format,
    kind: 'fours',
    futureInningsBalls,
  });
  markets.push(buildLiveAggregateOuMarket({
    marketId: 'total_match_sixes',
    marketType: 'TOTAL_MATCH_SIXES',
    name: 'Total Match Sixes',
    liveCount: sixProj.live,
    expected: sixProj.expected,
    overround,
    selectionPrefix: 'sel_six',
  }));
  markets.push(buildLiveAggregateOuMarket({
    marketId: 'total_match_fours',
    marketType: 'TOTAL_MATCH_FOURS',
    name: 'Total Match Fours',
    liveCount: fourProj.live,
    expected: fourProj.expected,
    overround,
    selectionPrefix: 'sel_four',
  }));

  // 4. Total Match Wickets — live wickets + expected remaining (never hardcode mean ~11.5).
  const liveWkts = currentMatchWickets(state, rules.maxWickets || 10);
  const expectedWkts = estimateExpectedMatchWickets(state, rules, liveWkts);
  let wktLine = Math.floor(expectedWkts) + 0.5;
  if (wktLine <= liveWkts) wktLine = liveWkts + 0.5;

  if (liveWkts > wktLine) {
    markets.push(createMarketDefinition({
      marketId: 'total_match_wickets',
      marketType: 'TOTAL_MATCH_WICKETS',
      category: 'totals',
      name: 'Total Match Wickets',
      status: 'SETTLED',
      line: wktLine,
      selections: [
        { selectionId: 'sel_wkt_over', name: `Over ${wktLine}`, status: 'WON', bettable: false, odds: null, won: true },
        { selectionId: 'sel_wkt_under', name: `Under ${wktLine}`, status: 'LOST', bettable: false, odds: null, won: false },
      ],
    }));
  } else {
    const underMax = Math.floor(wktLine);
    const moreAllowedForUnder = Math.max(0, underMax - liveWkts);
    const expectedMore = Math.max(0.05, expectedWkts - liveWkts);

    let pWktUnder;
    let pWktOver;
    if (moreAllowedForUnder <= 2) {
      pWktUnder = Math.max(0.01, Math.min(0.99, poissonCdfLeq(moreAllowedForUnder, expectedMore)));
      pWktOver = 1 - pWktUnder;
    } else {
      const fair = calculateOverUnderProbability(expectedWkts, wktLine, 1.0, liveWkts, 1.25);
      pWktOver = fair.pOver;
      pWktUnder = fair.pUnder;
    }

    markets.push(createMarketDefinition({
      marketId: 'total_match_wickets',
      marketType: 'TOTAL_MATCH_WICKETS',
      category: 'totals',
      name: 'Total Match Wickets',
      status: 'OPEN',
      line: wktLine,
      selections: [
        priceSelection({ selectionId: 'sel_wkt_over', name: `Over ${wktLine}`, probability: pWktOver, overround }),
        priceSelection({ selectionId: 'sel_wkt_under', name: `Under ${wktLine}`, probability: pWktUnder, overround }),
      ],
    }));
  }

  // 5. Match Run Range
  const baseRange = Math.floor(expectedMatchTotal / 50) * 50;
  const r1Min = Math.max(0, baseRange - 50);
  const r1Max = baseRange - 1;
  const r2Min = baseRange;
  const r2Max = baseRange + 49;
  const r3Min = baseRange + 50;

  const pR1Raw = r1Max < currentTotal ? 0 : calculateRangeProbability(expectedMatchTotal, r1Min, r1Max, currentTotal);
  const pR2Raw = r2Max < currentTotal ? 0 : calculateRangeProbability(expectedMatchTotal, r2Min, r2Max, currentTotal);
  const pR3Raw = calculateRangeProbability(expectedMatchTotal, r3Min, r3Min + 400, currentTotal);
  const rangeRaw = [pR1Raw, pR2Raw, pR3Raw].map((p) => Math.max(0, p));
  const rangeSum = rangeRaw.reduce((a, b) => a + b, 0);
  const rangeNorm = (rangeSum > 0 ? rangeRaw.map((p) => p / rangeSum) : [0.33, 0.34, 0.33])
    .map((p) => Math.max(0.0001, Math.min(0.9999, p)));
  const rangeNormSum = rangeNorm.reduce((a, b) => a + b, 0);
  const [pR1, pR2, pR3] = rangeNorm.map((p) => p / rangeNormSum);

  markets.push(createMarketDefinition({
    marketId: 'match_run_range',
    marketType: 'MATCH_RUN_RANGE',
    category: 'totals',
    name: 'Match Run Range',
    status: 'OPEN',
    selections: [
      priceSelection({ selectionId: 'sel_rr_1', name: `${r1Min}–${r1Max} runs`, probability: pR1, overround }),
      priceSelection({ selectionId: 'sel_rr_2', name: `${r2Min}–${r2Max} runs`, probability: pR2, overround }),
      priceSelection({ selectionId: 'sel_rr_3', name: `${r3Min}+ runs`, probability: pR3, overround }),
    ],
  }));

  // 6. Both Teams To Score 150+
  const bttsLine = state.format === 'THE_HUNDRED' ? 125 : 150;
  const battingExpected = calc.expectedTotal;
  const chasingExpected = state.currentInnings === 2
    ? battingExpected
    : expectedMatchTotal - battingExpected;
  const pBatReach = (battingTeam.runs || 0) >= bttsLine
    ? 0.99
    : calculateOverUnderProbability(battingExpected, bttsLine - 0.5, 2.0, battingTeam.runs || 0).pOver;
  const otherCurrent = fieldingTeam.runs || 0;
  const pOtherReach = otherCurrent >= bttsLine
    ? 0.99
    : calculateOverUnderProbability(
      state.currentInnings === 2 ? otherCurrent : chasingExpected,
      bttsLine - 0.5,
      2.0,
      otherCurrent,
    ).pOver;
  const pBtts = Math.max(0.0001, Math.min(0.9999, pBatReach * pOtherReach));
  markets.push(createMarketDefinition({
    marketId: 'btts_score_x',
    marketType: 'BOTH_TEAMS_TO_SCORE_X',
    category: 'totals',
    name: `Both Teams To Score ${bttsLine}+ Runs`,
    status: 'OPEN',
    selections: [
      priceSelection({ selectionId: 'sel_btts_yes', name: 'Yes', probability: pBtts, overround }),
      priceSelection({ selectionId: 'sel_btts_no', name: 'No', probability: 1.0 - pBtts, overround }),
    ],
  }));

  return markets;
}
