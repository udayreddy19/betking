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
import {
  generateLine,
  minLiveTotalLineLead,
} from '../lines/TotalLineGenerator.mjs';
import {
  DEFAULT_MARGIN_CONFIG,
  MAX_LIVE_TOTAL_OVER_ODDS,
} from '../pricing/MarginCalculator.mjs';
import { applyLiveTotalOverOddsCap } from './TeamTotalMarket.mjs';
import { milestoneBetCutoffBalls, milestoneOversForFormat } from '../eligibility/marketEligibility.mjs';

/**
 * Phase rates vs live innings-average rpb.
 * PP is hotter and middle cooler so early windows sit near real format averages
 * instead of a flat over-number multiplier or a huge house pad.
 */
const PHASE_PP_VS_AVG = 1.15;
const PHASE_MIDDLE_VS_AVG = 0.92;

/** Small juice on the fair projection (~2–3 runs when the window is still open). */
const MILESTONE_HOUSE_PAD = 2.5;

/**
 * Split remaining balls in [ballsCompleted, targetBalls) into powerplay vs rest.
 * Formats with no powerplay (e.g. TEST) put everything in `otherBalls`.
 */
function remainingBallsByPhase(ballsCompleted, targetBalls, powerplayBalls) {
  const start = Math.max(0, Number(ballsCompleted) || 0);
  const end = Math.max(start, Number(targetBalls) || 0);
  const ppEnd = Math.max(0, Number(powerplayBalls) || 0);
  if (end <= start) return { ppBalls: 0, otherBalls: 0 };
  if (ppEnd <= 0) return { ppBalls: 0, otherBalls: end - start };
  if (end <= ppEnd) return { ppBalls: end - start, otherBalls: 0 };
  if (start >= ppEnd) return { ppBalls: 0, otherBalls: end - start };
  return { ppBalls: ppEnd - start, otherBalls: end - ppEnd };
}

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

function milestoneStdDevFloor(ballsLeftInWindow) {
  const left = Math.max(0, Number(ballsLeftInWindow) || 0);
  return Math.max(2, Math.min(5.5, left * 0.22));
}

/**
 * Expected total at an over boundary (5 / 10 / 15 / 20).
 * Projects remaining balls in the window with format powerplay/middle rates,
 * not a linear slice of innings par and not a blunt flat pad.
 */
export function estimateTotalAtOvers(state, targetOvers) {
  const rules = getFormatRules(state.format) || getFormatRules('T20');
  const battingTeam = state.battingTeamId === state.team1.id ? state.team1 : state.team2;
  const totalBalls = rules.ballsPerInnings;
  const ballsPerOver = rules.ballsPerOver || 6;
  const targetBalls = targetOvers * ballsPerOver;
  const ballsCompleted = state.ballsCompleted || 0;
  const currentScore = battingTeam.runs || 0;

  if (ballsCompleted >= targetBalls) {
    return currentScore;
  }

  const ballsLeftInWindow = targetBalls - ballsCompleted;
  const inningsBallsLeft = Math.max(1, totalBalls - ballsCompleted);
  const chaseTarget = state.currentInnings === 2 ? state.target : null;

  const calc = calculateScoringExpectation({
    currentScore,
    ballsRemaining: inningsBallsLeft,
    wicketsRemaining: Math.max(1, 10 - (battingTeam.wickets || 0)),
    ballsCompleted,
    format: state.format,
    target: chaseTarget,
  });

  const inningsAvgRpb = calc.expectedRemainingRuns / inningsBallsLeft;
  const { ppBalls, otherBalls } = remainingBallsByPhase(
    ballsCompleted,
    targetBalls,
    rules.powerplayBalls,
  );
  const hasPowerplay = (Number(rules.powerplayBalls) || 0) > 0;
  const ppRate = inningsAvgRpb * PHASE_PP_VS_AVG;
  const otherRate = inningsAvgRpb * (hasPowerplay ? PHASE_MIDDLE_VS_AVG : 1);
  const remaining = ppBalls * ppRate + otherBalls * otherRate;
  const pad = MILESTONE_HOUSE_PAD * (ballsLeftInWindow / targetBalls);
  let expectedAtTarget = currentScore + remaining + pad;

  if (chaseTarget != null) {
    expectedAtTarget = Math.min(expectedAtTarget, chaseTarget + 2);
  }

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
  const overround = marginConfig.liveTeamTotalOverround
    ?? DEFAULT_MARGIN_CONFIG.liveTeamTotalOverround;
  const overExtra = marginConfig.liveTotalsOverExtraOverround
    ?? DEFAULT_MARGIN_CONFIG.liveTotalsOverExtraOverround
    ?? 0;
  const maxOverOdds = marginConfig.maxLiveTotalOverOdds ?? MAX_LIVE_TOTAL_OVER_ODDS;
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
  const milestones = milestoneOversForFormat(rules);

  for (const targetOvers of milestones) {
    const targetBalls = targetOvers * ballsPerOver;
    const ballsLeftInWindow = Math.max(0, targetBalls - currentBalls);
    const currentScore = battingTeam.runs || 0;
    let expected = estimateTotalAtOvers(state, targetOvers);
    if (state.currentInnings === 2 && state.target != null && expected > state.target) {
      expected = Math.max(state.target - 5, currentScore + 1);
    }

    const lead = state.status === 'LIVE'
      ? minLiveTotalLineLead(ballsLeftInWindow, rules.historicalRunsPerBall)
      : 0.5;
    let line = generateLine(expected);

    const marketId = `i${inningsNum}_overs_0_${targetOvers}_total`;
    const marketType = `OVERS_0_${targetOvers}_TOTAL`;
    const name = `${innLabel} Overs 0 to ${targetOvers} - ${battingTeam.name} Total`;
    const cutoffBalls = milestoneBetCutoffBalls(targetOvers, ballsPerOver);

    // Early cut (~60% of window) or natural boundary — drop from book
    if (currentBalls >= cutoffBalls || currentBalls >= targetBalls) {
      markets.push(createMarketDefinition({
        marketId,
        marketType,
        category: 'overs',
        name,
        status: 'SUSPENDED',
        line,
        selections: [],
      }));
      continue;
    }

    // Over has already cashed on the projected line — stop selling.
    if (state.status === 'LIVE' && currentScore >= line) {
      markets.push(createMarketDefinition({
        marketId,
        marketType,
        category: 'overs',
        name,
        status: 'SETTLED',
        line,
        selections: [],
      }));
      continue;
    }

    line = Math.max(line, currentScore + lead);

    const { pOver, pUnder } = calculateOverUnderProbability(
      expected,
      line,
      1.35,
      currentScore,
      milestoneStdDevFloor(ballsLeftInWindow),
    );
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
    // Cap 50/50-ish soft Overs; leave longshot Overs long so the cap is not a gift.
    if (state.status === 'LIVE' && overSelection.odds > maxOverOdds && overSelection.odds <= 2.25) {
      const capped = applyLiveTotalOverOddsCap(
        overSelection,
        underSelection,
        overround + overExtra,
        maxOverOdds,
      );
      overSelection = capped.overSel;
      underSelection = capped.underSel;
    }
    markets.push(createMarketDefinition({
      // Innings-scoped id so 1st-innings powerplay bets do not reopen/settle as chase
      marketId,
      marketType,
      category: 'overs',
      name,
      status: 'OPEN',
      line,
      overround: overround + overExtra,
      selections: [overSelection, underSelection],
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
