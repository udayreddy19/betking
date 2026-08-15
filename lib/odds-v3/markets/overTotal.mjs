/**
 * OddsEngineV3 — Extended Over Markets (Group 4)
 * 
 * Generates:
 * 1. Current Over Total Runs
 * 2. Next Over Total Runs
 * 3. Next Over Team Runs
 * 4. First Innings Overs 0–5 Total (Powerplay)
 * 5. First Innings Overs 0–15 Total
 * 6. First Innings Overs 0–20 Total
 * 7. Current Over Odd/Even
 * 8. Next Over Odd/Even
 */

import { calculateScoringExpectation } from '../models/scoringModel.mjs';
import { calculateOverUnderProbability } from '../models/distributionModel.mjs';
import { getFormatRules } from '../format/CricketFormatRules.mjs';
import { priceSelection } from '../pricing/OddsCalculator.mjs';
import { createMarketDefinition } from '../models/MarketDefinition.mjs';

/**
 * Estimate expected runs per over from current match state.
 * Uses actual scoring rate blended with format historical rate,
 * adjusted by phase (powerplay / middle / death).
 */
function estimatePerOverRuns(state) {
  const rules = getFormatRules(state.format) || getFormatRules('T20');
  const ballsCompleted = state.ballsCompleted || 0;
  const currentOverNum = Math.floor(ballsCompleted / 6) + 1;
  const battingTeam = state.battingTeamId === state.team1.id ? state.team1 : state.team2;
  const currentScore = battingTeam.runs || 0;

  // Historical base: runs per ball × 6
  const basePerOver = rules.historicalRunsPerBall * 6;

  // Actual scoring rate (runs per over so far)
  const oversDone = ballsCompleted / 6;
  const actualPerOver = oversDone > 0.5 ? currentScore / oversDone : basePerOver;

  // Blend: weight actual rate more as the match progresses
  const progress = Math.min(1, ballsCompleted / rules.ballsPerInnings);
  const blendWeight = Math.min(0.75, progress * 1.5);
  const blendedPerOver = blendWeight * actualPerOver + (1 - blendWeight) * basePerOver;

  // Phase multiplier: powerplay is faster, death overs are faster, middle is slower
  const totalOvers = rules.ballsPerInnings / 6;
  const ppOvers = rules.powerplayBalls / 6;
  let phaseMultiplier = 1.0;
  if (currentOverNum <= ppOvers) {
    // Powerplay: ~10-15% higher scoring
    phaseMultiplier = 1.12;
  } else if (currentOverNum > totalOvers * 0.75) {
    // Death overs: ~15-20% higher scoring
    phaseMultiplier = 1.18;
  } else {
    // Middle overs: ~10% lower scoring
    phaseMultiplier = 0.90;
  }

  return Math.max(3.0, blendedPerOver * phaseMultiplier);
}

/**
 * Estimate expected total at a given over boundary (e.g., after 5, 15, 20 overs).
 * Uses scoring model for projected total, then scales to the fraction of innings.
 */
function estimateTotalAtOvers(state, targetOvers) {
  const rules = getFormatRules(state.format) || getFormatRules('T20');
  const battingTeam = state.battingTeamId === state.team1.id ? state.team1 : state.team2;
  const totalBalls = rules.ballsPerInnings;
  const targetBalls = targetOvers * 6;
  const ballsCompleted = state.ballsCompleted || 0;
  const currentScore = battingTeam.runs || 0;

  if (ballsCompleted >= targetBalls) {
    // Phase already passed — use actual score at that point (approximation)
    return currentScore;
  }

  // Project from current state to end of innings
  const calc = calculateScoringExpectation({
    currentScore,
    ballsRemaining: Math.max(0, totalBalls - ballsCompleted),
    wicketsRemaining: Math.max(1, 10 - (battingTeam.wickets || 0)),
    ballsCompleted,
    format: state.format,
    target: state.target,
  });

  // Proportion of innings completed at target overs
  const fractionAtTarget = targetBalls / totalBalls;
  // Fraction completed now
  const fractionNow = ballsCompleted / totalBalls;

  if (fractionAtTarget <= fractionNow) return currentScore;

  // Linear interpolation of expected score from now to end
  const remainingFraction = (fractionAtTarget - fractionNow) / (1 - fractionNow);
  const expectedAtTarget = currentScore + (calc.expectedTotal - currentScore) * remainingFraction;

  return Math.max(currentScore + 1, expectedAtTarget);
}

/**
 * Odd/Even probability for a single over's total runs.
 * Death overs skew slightly even (boundary-heavy = 4,6 → even numbers).
 * Powerplay skews slightly toward odd (singles + boundaries).
 * Middle overs are near 50/50.
 */
function oddEvenProbability(state) {
  const rules = getFormatRules(state.format) || getFormatRules('T20');
  const ballsCompleted = state.ballsCompleted || 0;
  const currentOverNum = Math.floor(ballsCompleted / 6) + 1;
  const totalOvers = rules.ballsPerInnings / 6;

  if (currentOverNum > totalOvers * 0.75) {
    // Death: boundaries dominate → even slightly favored
    return { pOdd: 0.47, pEven: 0.53 };
  }
  if (currentOverNum <= rules.powerplayBalls / 6) {
    // Powerplay: mix of singles and fours → slight odd bias
    return { pOdd: 0.52, pEven: 0.48 };
  }
  // Middle overs: near-equal
  return { pOdd: 0.50, pEven: 0.50 };
}

export function generateExtendedOverMarkets(state, validation = {}, marginConfig = {}) {
  const overround = marginConfig.liveTeamTotalOverround || 0.055;
  const battingTeam = state.battingTeamId === state.team1.id ? state.team1 : state.team2;
  const currentBalls = state.ballsCompleted || 0;
  const currentOverNum = Math.floor(currentBalls / 6) + 1;
  const nextOverNum = currentOverNum + 1;

  const markets = [];

  // 1. Next Over Total — derived from current run rate & phase
  const expectedPerOver = estimatePerOverRuns(state);
  const nextOverLine = Math.floor(expectedPerOver) + 0.5;
  const { pOver: pNextOverOver, pUnder: pNextOverUnder } = calculateOverUnderProbability(expectedPerOver, nextOverLine);
  markets.push(createMarketDefinition({
    marketId: `next_over_${nextOverNum}_total`,
    marketType: 'NEXT_OVER_TOTAL',
    category: 'overs',
    name: `Next Over (${nextOverNum}) - ${battingTeam.name} Total Runs`,
    status: 'OPEN',
    line: nextOverLine,
    selections: [
      priceSelection({ selectionId: 'sel_next_over_over', name: `Over ${nextOverLine}`, probability: pNextOverOver, overround }),
      priceSelection({ selectionId: 'sel_next_over_under', name: `Under ${nextOverLine}`, probability: pNextOverUnder, overround }),
    ],
  }));

  const innLabel = state.currentInnings === 2 ? '2nd Innings' : '1st Innings';

  // 2. Overs 0 to 5 Total (Powerplay) — derived from scoring model
  const expected05 = estimateTotalAtOvers(state, 5);
  const line05 = Math.floor(expected05) + 0.5;
  const { pOver: p05Over, pUnder: p05Under } = calculateOverUnderProbability(expected05, line05);
  markets.push(createMarketDefinition({
    marketId: 'overs_0_5_total',
    marketType: 'OVERS_0_5_TOTAL',
    category: 'overs',
    name: `${innLabel} Overs 0 to 5 - ${battingTeam.name} Total`,
    status: currentBalls <= 30 ? 'OPEN' : 'SUSPENDED',
    line: line05,
    selections: [
      priceSelection({ selectionId: 'sel_05_over', name: `Over ${line05}`, probability: p05Over, overround }),
      priceSelection({ selectionId: 'sel_05_under', name: `Under ${line05}`, probability: p05Under, overround }),
    ],
  }));

  // 3. Overs 0 to 15 Total — derived from scoring model
  let expected015 = estimateTotalAtOvers(state, 15);
  if (state.currentInnings === 2 && state.target != null && expected015 > state.target) {
    expected015 = Math.max(state.target - 20, 95);
  }
  const line015 = Math.floor(expected015) + 0.5;
  const { pOver: p015Over, pUnder: p015Under } = calculateOverUnderProbability(expected015, line015);
  markets.push(createMarketDefinition({
    marketId: 'overs_0_15_total',
    marketType: 'OVERS_0_15_TOTAL',
    category: 'overs',
    name: `${innLabel} Overs 0 to 15 - ${battingTeam.name} Total`,
    status: currentBalls <= 90 ? 'OPEN' : 'SUSPENDED',
    line: line015,
    selections: [
      priceSelection({ selectionId: 'sel_015_over', name: `Over ${line015}`, probability: p015Over, overround }),
      priceSelection({ selectionId: 'sel_015_under', name: `Under ${line015}`, probability: p015Under, overround }),
    ],
  }));

  // 4. Overs 0 to 20 Total — derived from scoring model
  let expected020 = estimateTotalAtOvers(state, 20);
  if (state.currentInnings === 2 && state.target != null && expected020 > state.target) {
    expected020 = Math.max(state.target - 5, (battingTeam.runs || 0) + 10);
  }
  const line020 = Math.floor(expected020) + 0.5;
  const { pOver: p020Over, pUnder: p020Under } = calculateOverUnderProbability(expected020, line020);
  markets.push(createMarketDefinition({
    marketId: 'overs_0_20_total',
    marketType: 'OVERS_0_20_TOTAL',
    category: 'overs',
    name: `${innLabel} Overs 0 to 20 - ${battingTeam.name} Total`,
    status: currentBalls <= 120 ? 'OPEN' : 'SUSPENDED',
    line: line020,
    selections: [
      priceSelection({ selectionId: 'sel_020_over', name: `Over ${line020}`, probability: p020Over, overround }),
      priceSelection({ selectionId: 'sel_020_under', name: `Under ${line020}`, probability: p020Under, overround }),
    ],
  }));

  // 5. Current Over Odd / Even — phase-derived
  const { pOdd: pCurrOdd, pEven: pCurrEven } = oddEvenProbability(state);
  markets.push(createMarketDefinition({
    marketId: `current_over_${currentOverNum}_odd_even`,
    marketType: 'CURRENT_OVER_ODD_EVEN',
    category: 'overs',
    name: `Current Over (${currentOverNum}) - Odd/Even Total Runs`,
    status: 'OPEN',
    selections: [
      priceSelection({ selectionId: 'sel_cov_odd', name: 'Odd', probability: pCurrOdd, overround }),
      priceSelection({ selectionId: 'sel_cov_even', name: 'Even', probability: pCurrEven, overround }),
    ],
  }));

  // 6. Next Over Odd / Even — phase-derived (use next over context)
  const nextOverState = { ...state, ballsCompleted: (state.ballsCompleted || 0) + 6 };
  const { pOdd: pNextOdd, pEven: pNextEven } = oddEvenProbability(nextOverState);
  markets.push(createMarketDefinition({
    marketId: `next_over_${nextOverNum}_odd_even`,
    marketType: 'NEXT_OVER_ODD_EVEN',
    category: 'overs',
    name: `Next Over (${nextOverNum}) - Odd/Even Total Runs`,
    status: 'OPEN',
    selections: [
      priceSelection({ selectionId: 'sel_nov_odd', name: 'Odd', probability: pNextOdd, overround }),
      priceSelection({ selectionId: 'sel_nov_even', name: 'Even', probability: pNextEven, overround }),
    ],
  }));

  return markets;
}
