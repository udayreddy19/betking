/**
 * V4 core totals — team_total, match_total, next-over — via ScoreDistributionEngine.
 * Keeps settlement marketId / selectionId shapes compatible with V3.
 */

import { priceSelection } from '../../odds-shared/pricing/OddsCalculator.mjs';
import { createMarketDefinition } from '../../odds-shared/models/MarketDefinition.mjs';
import { formatRulesOrDefault, getFormatRules, nextBallSlot } from '../../odds-shared/format/CricketFormatRules.mjs';
import { lineScopedSelectionId } from '../../odds-shared/lineIdentity.mjs';
import {
  DEFAULT_MARGIN_CONFIG,
  MAX_LIVE_TOTAL_OVER_ODDS,
} from '../../odds-shared/pricing/MarginCalculator.mjs';
import { minLiveTotalLineLead } from '../../odds-shared/lines/TotalLineGenerator.mjs';
import { applyLiveTotalOverOddsCap } from '../../odds-shared/markets/TeamTotalMarket.mjs';
import { V5_MARGIN_CONFIG } from '../v5HouseProtect.mjs';
import { computeMomentum } from '../models/MomentumEngine.mjs';
import {
  teamTotalDistribution,
  nextOverRunsDistribution,
  pOverUnderFromDistribution,
  pickBalancedLine,
} from '../models/ScoreDistributionEngine.mjs';

function margins(config = {}) {
  return {
    ...DEFAULT_MARGIN_CONFIG,
    ...V5_MARGIN_CONFIG,
    ...config,
  };
}

function priceOuPair({ line, pOver, pUnder, overround, overExtra, maxOverOdds, live }) {
  let overSelection = priceSelection({
    selectionId: lineScopedSelectionId('over', line),
    name: `Over ${line}`,
    probability: pOver,
    overround: overround + overExtra,
  });
  let underSelection = priceSelection({
    selectionId: lineScopedSelectionId('under', line),
    name: `Under ${line}`,
    probability: pUnder,
    overround,
  });
  if (live) {
    const capped = applyLiveTotalOverOddsCap(
      overSelection,
      underSelection,
      overround + overExtra,
      maxOverOdds,
    );
    overSelection = capped.overSel;
    underSelection = capped.underSel;
  }
  return [overSelection, underSelection];
}

export function generateTeamTotalMarketV5(state, validation = {}, marginConfig = V5_MARGIN_CONFIG) {
  const cfg = margins(marginConfig);
  const overround = cfg.liveTeamTotalOverround ?? 0.16;
  const overExtra = cfg.liveTotalsOverExtraOverround ?? 0.06;
  const maxOverOdds = cfg.maxLiveTotalOverOdds ?? MAX_LIVE_TOTAL_OVER_ODDS;
  const momentum = cfg.v4Momentum || (state.status === 'LIVE' ? computeMomentum(state) : null);
  const mom = momentum?.factor ?? 1;

  if (validation.determined) {
    return createMarketDefinition({
      marketId: 'team_total',
      marketType: 'TEAM_TOTAL',
      name: 'Team Total Runs',
      status: 'SETTLED',
      selections: [],
    });
  }

  const rules = formatRulesOrDefault(state.format);
  const battingTeam = state.battingTeamId === state.team1.id ? state.team1 : state.team2;
  const wicketsRemaining = Math.max(1, rules.maxWickets - (battingTeam.wickets || 0));
  const currentScore = battingTeam.runs || 0;
  const ballsRemaining = Number(state.ballsRemaining) || 0;

  const dist = teamTotalDistribution({
    currentScore,
    format: state.format,
    wicketsInHand: wicketsRemaining,
    ballsRemaining: state.status === 'LIVE' ? ballsRemaining : rules.ballsPerInnings,
    ballsPerInnings: state.ballsPerInnings || rules.ballsPerInnings,
    momentumFactor: mom,
    haircut: cfg.resourceRunsHaircut ?? 0.93,
    targetCap: state.currentInnings === 2 && state.target != null ? state.target : null,
  });

  const lead = state.status === 'LIVE'
    ? minLiveTotalLineLead(ballsRemaining, rules.historicalRunsPerBall)
    : 0.5;
  let effectiveLine = pickBalancedLine(dist.mean, { minLead: lead, floor: currentScore });

  if (state.currentInnings === 2 && state.target != null) {
    effectiveLine = Math.min(effectiveLine, state.target + 2.5);
  }

  if (state.status === 'LIVE' && currentScore >= effectiveLine) {
    return createMarketDefinition({
      marketId: 'team_total',
      marketType: 'TEAM_TOTAL',
      name: `${battingTeam.name} Total Runs`,
      status: 'SETTLED',
      line: effectiveLine,
      selections: [],
    });
  }

  const { pOver, pUnder } = pOverUnderFromDistribution(dist, effectiveLine);
  const selections = priceOuPair({
    line: effectiveLine,
    pOver,
    pUnder,
    overround,
    overExtra,
    maxOverOdds,
    live: state.status === 'LIVE',
  });

  return createMarketDefinition({
    marketId: 'team_total',
    marketType: 'TEAM_TOTAL',
    name: `${battingTeam.name} Total Runs`,
    status: 'OPEN',
    line: effectiveLine,
    overround: overround + overExtra,
    selections,
    v4Pricing: { engine: 'ScoreDistributionEngine', mean: dist.mean, sd: dist.sd, method: dist.method },
  });
}

export function generateMatchTotalMarketV5(state, validation = {}, marginConfig = V5_MARGIN_CONFIG) {
  const cfg = margins(marginConfig);
  const overround = cfg.liveTeamTotalOverround ?? 0.16;
  const overExtra = cfg.liveTotalsOverExtraOverround ?? 0.06;
  const maxOverOdds = cfg.maxLiveTotalOverOdds ?? MAX_LIVE_TOTAL_OVER_ODDS;
  const momentum = cfg.v4Momentum || (state.status === 'LIVE' ? computeMomentum(state) : null);
  const mom = momentum?.factor ?? 1;

  if (validation.determined) {
    return createMarketDefinition({
      marketId: 'match_total',
      marketType: 'MATCH_TOTAL',
      name: 'Total Match Runs',
      status: 'SETTLED',
      selections: [],
    });
  }

  const rules = formatRulesOrDefault(state.format);
  const battingTeam = state.battingTeamId === state.team1.id ? state.team1 : state.team2;
  const fieldingTeam = state.bowlingTeamId === state.team1.id ? state.team1 : state.team2;
  const wicketsRemaining = Math.max(1, rules.maxWickets - (battingTeam.wickets || 0));
  const ballsRemaining = Number(state.ballsRemaining) || 0;
  const currentCombined = (state.team1?.runs || 0) + (state.team2?.runs || 0);

  const batDist = teamTotalDistribution({
    currentScore: battingTeam.runs || 0,
    format: state.format,
    wicketsInHand: wicketsRemaining,
    ballsRemaining: state.status === 'LIVE' ? ballsRemaining : rules.ballsPerInnings,
    ballsPerInnings: state.ballsPerInnings || rules.ballsPerInnings,
    momentumFactor: mom,
    haircut: cfg.resourceRunsHaircut ?? 0.93,
    targetCap: state.currentInnings === 2 && state.target != null ? state.target : null,
  });

  let expectedMatchTotal = batDist.mean;
  if (Number(state.currentInnings) === 1) {
    // Add a full second-innings par expectation
    expectedMatchTotal = batDist.mean + formatRulesOrDefault(state.format).ballsPerInnings
      * (rules.historicalRunsPerBall || 1.2) * 0.92;
  } else {
    expectedMatchTotal = (fieldingTeam.runs || 0) + batDist.mean;
    if (state.target != null) {
      expectedMatchTotal = Math.min(expectedMatchTotal, (fieldingTeam.runs || 0) + state.target + 2);
    }
  }

  const dist = {
    mean: expectedMatchTotal,
    sd: batDist.sd,
    variance: batDist.variance,
    method: batDist.method,
  };

  const lead = state.status === 'LIVE'
    ? minLiveTotalLineLead(ballsRemaining, rules.historicalRunsPerBall)
    : 0.5;
  let effectiveLine = pickBalancedLine(dist.mean, { minLead: lead, floor: currentCombined });

  if (state.currentInnings === 2 && state.target != null) {
    effectiveLine = Math.min(effectiveLine, (fieldingTeam.runs || 0) + state.target + 2.5);
  }

  if (state.status === 'LIVE' && currentCombined >= effectiveLine) {
    return createMarketDefinition({
      marketId: 'match_total',
      marketType: 'MATCH_TOTAL',
      name: 'Total Match Runs',
      status: 'SETTLED',
      line: effectiveLine,
      selections: [],
    });
  }

  const { pOver, pUnder } = pOverUnderFromDistribution(dist, effectiveLine);
  const selections = priceOuPair({
    line: effectiveLine,
    pOver,
    pUnder,
    overround,
    overExtra,
    maxOverOdds,
    live: state.status === 'LIVE',
  });

  return createMarketDefinition({
    marketId: 'match_total',
    marketType: 'MATCH_TOTAL',
    name: 'Total Match Runs',
    status: 'OPEN',
    line: effectiveLine,
    overround: overround + overExtra,
    selections,
    v4Pricing: { engine: 'ScoreDistributionEngine', mean: dist.mean, sd: dist.sd, method: dist.method },
  });
}

/**
 * Next-over total only (rest of over catalog stays on V3 extended generators).
 */
export function generateNextOverTotalMarketV5(state, validation = {}, marginConfig = V5_MARGIN_CONFIG) {
  const cfg = margins(marginConfig);
  if (validation.determined || state.status !== 'LIVE') return [];

  const rules = getFormatRules(state.format) || formatRulesOrDefault(state.format);
  const ballsPerOver = rules.ballsPerOver || 6;
  const inningsOvers = Math.floor((state.ballsPerInnings || rules.ballsPerInnings) / ballsPerOver);
  const currentBalls = state.ballsCompleted || 0;
  const slot = typeof nextBallSlot === 'function' ? nextBallSlot(currentBalls, ballsPerOver) : null;
  const currentOverNum = Math.floor(currentBalls / ballsPerOver) + 1;
  const nextOverNum = slot?.ballsIntoOver === 0 ? currentOverNum : currentOverNum + 1;
  const inningsNum = Number(state.currentInnings) || 1;

  if (!(nextOverNum <= inningsOvers && currentBalls < (state.ballsPerInnings || rules.ballsPerInnings))) {
    return [];
  }

  const battingTeam = state.battingTeamId === state.team1.id ? state.team1 : state.team2;
  const momentum = cfg.v4Momentum || computeMomentum(state);
  const dist = nextOverRunsDistribution({
    format: state.format,
    momentumFactor: momentum?.factor ?? 1,
  });
  const line = pickBalancedLine(dist.mean, { minLead: 0.5, floor: 0 });
  const { pOver, pUnder } = pOverUnderFromDistribution(dist, line);
  const overround = cfg.liveTeamTotalOverround ?? 0.16;

  return [createMarketDefinition({
    marketId: `i${inningsNum}_next_over_${nextOverNum}_total`,
    marketType: 'NEXT_OVER_TOTAL',
    category: 'overs',
    name: `Next Over (${nextOverNum}) - ${battingTeam.name} Total Runs`,
    status: 'OPEN',
    line,
    selections: [
      priceSelection({
        selectionId: lineScopedSelectionId('over', line),
        name: `Over ${line}`,
        probability: pOver,
        overround,
      }),
      priceSelection({
        selectionId: lineScopedSelectionId('under', line),
        name: `Under ${line}`,
        probability: pUnder,
        overround,
      }),
    ],
    v4Pricing: { engine: 'ScoreDistributionEngine', mean: dist.mean, sd: dist.sd, method: dist.method },
  })];
}
