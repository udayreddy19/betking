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
import { getFormatRules, nextBallSlot } from '../format/CricketFormatRules.mjs';
import { priceSelection } from '../pricing/OddsCalculator.mjs';
import { createMarketDefinition } from '../models/MarketDefinition.mjs';
import { lineScopedSelectionId } from '../lineIdentity.mjs';

/**
 * Estimate expected runs per over from current match state.
 * Uses actual scoring rate blended with format historical rate,
 * adjusted by phase (powerplay / middle / death).
 */
function estimatePerOverRuns(state) {
  const rules = getFormatRules(state.format) || getFormatRules('T20');
  const ballsPerOver = rules.ballsPerOver || 6;
  const ballsCompleted = state.ballsCompleted || 0;
  const currentOverNum = Math.floor(ballsCompleted / ballsPerOver) + 1;
  const battingTeam = state.battingTeamId === state.team1.id ? state.team1 : state.team2;
  const currentScore = battingTeam.runs || 0;

  // Historical base: runs per ball × 6
  const basePerOver = rules.historicalRunsPerBall * ballsPerOver;

  // Actual scoring rate (runs per over so far)
  const oversDone = ballsCompleted / ballsPerOver;
  const actualPerOver = oversDone > 0.5 ? currentScore / oversDone : basePerOver;

  // Blend: weight actual rate more as the match progresses
  const progress = Math.min(1, ballsCompleted / rules.ballsPerInnings);
  const blendWeight = Math.min(0.75, progress * 1.5);
  const blendedPerOver = blendWeight * actualPerOver + (1 - blendWeight) * basePerOver;

  // Phase multiplier: powerplay is faster, death overs are faster, middle is slower
  const totalOvers = rules.ballsPerInnings / ballsPerOver;
  const ppOvers = rules.powerplayBalls / ballsPerOver;
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
  const ballsPerOver = rules.ballsPerOver || 6;
  const targetBalls = targetOvers * ballsPerOver;
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
  const ballsPerOver = rules.ballsPerOver || 6;
  const currentOverNum = Math.floor(ballsCompleted / ballsPerOver) + 1;
  const totalOvers = rules.ballsPerInnings / ballsPerOver;

  if (currentOverNum > totalOvers * 0.75) {
    // Death: boundaries dominate → even slightly favored
    return { pOdd: 0.47, pEven: 0.53 };
  }
  if (currentOverNum <= rules.powerplayBalls / ballsPerOver) {
    // Powerplay: mix of singles and fours → slight odd bias
    return { pOdd: 0.52, pEven: 0.48 };
  }
  // Middle overs: near-equal
  return { pOdd: 0.50, pEven: 0.50 };
}

export function generateExtendedOverMarkets(state, validation = {}, marginConfig = {}) {
  const overround = marginConfig.liveTeamTotalOverround || 0.055;
  const rules = getFormatRules(state.format) || getFormatRules('T20');
  const ballsPerOver = rules.ballsPerOver || 6;
  const battingTeam = state.battingTeamId === state.team1.id ? state.team1 : state.team2;
  const currentBalls = state.ballsCompleted || 0;
  const inningsOvers = rules.ballsPerInnings / ballsPerOver;
  const slot = nextBallSlot(currentBalls, ballsPerOver);
  const nextOverNum = slot.nextOverNum;

  const inningsNum = state.currentInnings === 2 ? 2 : 1;
  const markets = [];

  if (nextOverNum <= inningsOvers && currentBalls < rules.ballsPerInnings) {
    const expectedPerOver = estimatePerOverRuns(state);
    const nextOverLine = Math.floor(expectedPerOver) + 0.5;
    const { pOver: pNextOverOver, pUnder: pNextOverUnder } = calculateOverUnderProbability(expectedPerOver, nextOverLine);
    markets.push(createMarketDefinition({
      marketId: `i${inningsNum}_next_over_${nextOverNum}_total`,
      marketType: 'NEXT_OVER_TOTAL',
      category: 'overs',
      name: `Next Over (${nextOverNum}) - ${battingTeam.name} Total Runs`,
      status: 'OPEN',
      line: nextOverLine,
      selections: [
        priceSelection({ selectionId: lineScopedSelectionId('over', nextOverLine), name: `Over ${nextOverLine}`, probability: pNextOverOver, overround }),
        priceSelection({ selectionId: lineScopedSelectionId('under', nextOverLine), name: `Under ${nextOverLine}`, probability: pNextOverUnder, overround }),
      ],
    }));
  }

  const innLabel = state.currentInnings === 2 ? '2nd Innings' : '1st Innings';
  const milestones = [5, 10, 15, 20].filter((overs) => overs <= inningsOvers);

  for (const targetOvers of milestones) {
    let expected = estimateTotalAtOvers(state, targetOvers);
    if (state.currentInnings === 2 && state.target != null && expected > state.target) {
      expected = Math.max(state.target - 5, (battingTeam.runs || 0) + 1);
    }
    const line = Math.floor(expected) + 0.5;
    const { pOver, pUnder } = calculateOverUnderProbability(expected, line);
    const targetBalls = targetOvers * ballsPerOver;
    markets.push(createMarketDefinition({
      // Innings-scoped id so 1st-innings powerplay bets do not reopen/settle as chase
      marketId: `i${inningsNum}_overs_0_${targetOvers}_total`,
      marketType: `OVERS_0_${targetOvers}_TOTAL`,
      category: 'overs',
      name: `${innLabel} Overs 0 to ${targetOvers} - ${battingTeam.name} Total`,
      status: currentBalls >= targetBalls ? 'SUSPENDED' : 'OPEN',
      line,
      selections: [
        priceSelection({ selectionId: lineScopedSelectionId('over', line), name: `Over ${line}`, probability: pOver, overround }),
        priceSelection({ selectionId: lineScopedSelectionId('under', line), name: `Under ${line}`, probability: pUnder, overround }),
      ],
    }));
  }

  if (!slot.currentOverComplete && currentBalls < rules.ballsPerInnings) {
    const { pOdd: pCurrOdd, pEven: pCurrEven } = oddEvenProbability(state);
    markets.push(createMarketDefinition({
      marketId: `current_over_${slot.overNum}_odd_even`,
      marketType: 'CURRENT_OVER_ODD_EVEN',
      category: 'overs',
      name: `Current Over (${slot.overNum}) - Odd/Even Total Runs`,
      status: 'OPEN',
      selections: [
        priceSelection({ selectionId: 'sel_cov_odd', name: 'Odd', probability: pCurrOdd, overround }),
        priceSelection({ selectionId: 'sel_cov_even', name: 'Even', probability: pCurrEven, overround }),
      ],
    }));
  }

  if (nextOverNum <= inningsOvers && currentBalls < rules.ballsPerInnings) {
    const nextOverState = { ...state, ballsCompleted: slot.currentOverComplete ? currentBalls : currentBalls + (ballsPerOver - (currentBalls % ballsPerOver)) };
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
  }

  return markets;
}
