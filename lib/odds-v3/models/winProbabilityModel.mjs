/**
 * OddsEngineV3 — WinProbabilityModel
 * 
 * Computes win probabilities for Team 1 and Team 2.
 * Strictly satisfies P(Team 1) + P(Team 2) = 1.0 (or P1 + P2 + P_tie = 1.0 for matches with tie probability).
 */

import { getFormatRules } from '../format/CricketFormatRules.mjs';
import { calculateScoringExpectation } from './scoringModel.mjs';
import { calculateMatchWinnerProbability } from '../pricing/ProbabilityModel.mjs';

/**
 * Calculates win probabilities for Team 1 and Team 2.
 * 
 * @param {import('../models/CanonicalMatchState.mjs').CanonicalMatchState} state
 * @returns {{ pTeam1: number, pTeam2: number, pTie: number }}
 */
export function calculateWinProbability(state) {
  const rules = getFormatRules(state.format) || getFormatRules('T20');

  // Completed match check
  if (state.status === 'COMPLETED') {
    if (state.team1.runs > state.team2.runs) return { pTeam1: 1.0, pTeam2: 0.0, pTie: 0.0 };
    if (state.team2.runs > state.team1.runs) return { pTeam1: 0.0, pTeam2: 1.0, pTie: 0.0 };
    return { pTeam1: 0.0, pTeam2: 0.0, pTie: 1.0 };
  }

  const battingIsTeam1 = state.battingTeamId === state.team1.id;
  const battingTeam = battingIsTeam1 ? state.team1 : state.team2;

  // Pre-match / 1st Innings Win Probability — batting side vs format par
  if (state.currentInnings === 1) {
    const wicketsRemaining = Math.max(1, rules.maxWickets - (battingTeam.wickets || 0));
    const calc = calculateScoringExpectation({
      currentScore: battingTeam.runs || 0,
      ballsRemaining: state.ballsRemaining,
      wicketsRemaining,
      ballsCompleted: state.ballsCompleted,
      format: state.format,
    });
    const parTotal = rules.ballsPerInnings * rules.historicalRunsPerBall;
    const sigma = Math.max(18, parTotal * 0.16);
    const zScore = (calc.expectedTotal - parTotal) / sigma;
    const pBatRaw = 1 / (1 + Math.exp(-zScore));
    const pBat = Math.max(0.08, Math.min(0.92, pBatRaw));
    const pField = 1.0 - pBat;

    return battingIsTeam1
      ? { pTeam1: pBat, pTeam2: pField, pTie: 0.02 }
      : { pTeam1: pField, pTeam2: pBat, pTie: 0.02 };
  }

  // 2nd Innings Win Probability (Chase Model)
  const chaseTeamIsTeam1 = battingIsTeam1;
  const runsRequired = state.runsRequired != null
    ? state.runsRequired
    : (state.target != null ? Math.max(0, state.target - (battingTeam.runs || 0)) : null);

  if (state.target == null || state.target <= 0 || runsRequired == null) {
    return { pTeam1: 0.5, pTeam2: 0.5, pTie: 0.02 };
  }

  const ballsRemaining = Math.max(0, state.ballsRemaining);
  const wicketsRemaining = Math.max(0, rules.maxWickets - (battingTeam.wickets || 0));

  if (runsRequired <= 0) {
    return chaseTeamIsTeam1
      ? { pTeam1: 1.0, pTeam2: 0.0, pTie: 0.0 }
      : { pTeam1: 0.0, pTeam2: 1.0, pTie: 0.0 };
  }

  if (ballsRemaining <= 0 || wicketsRemaining <= 0) {
    return chaseTeamIsTeam1
      ? { pTeam1: 0.0, pTeam2: 1.0, pTie: 0.0 }
      : { pTeam1: 1.0, pTeam2: 0.0, pTie: 0.0 };
  }

  const { pChase } = calculateMatchWinnerProbability({
    runsRequired: Math.max(0, runsRequired),
    ballsRemaining,
    wicketsRemaining: Math.max(1, wicketsRemaining),
    ballsCompleted: state.ballsCompleted,
    ballsPerInnings: state.ballsPerInnings || rules.ballsPerInnings,
    target: state.target,
    chasingScore: battingTeam.runs || 0,
    format: state.format,
    chasingTeamId: state.battingTeamId,
    fieldingTeamId: state.bowlingTeamId,
  });

  const pBatting = Math.max(0.01, Math.min(0.99, pChase));
  const pTeam1 = chaseTeamIsTeam1 ? pBatting : (1.0 - pBatting);
  const pTeam2 = chaseTeamIsTeam1 ? (1.0 - pBatting) : pBatting;

  return {
    pTeam1,
    pTeam2,
    pTie: 0.015,
  };
}
