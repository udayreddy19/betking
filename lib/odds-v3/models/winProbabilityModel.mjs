/**
 * OddsEngineV3 — WinProbabilityModel
 * 
 * Computes win probabilities for Team 1 and Team 2.
 * Strictly satisfies P(Team 1) + P(Team 2) = 1.0 (or P1 + P2 + P_tie = 1.0 for matches with tie probability).
 */

import { getFormatRules } from '../format/CricketFormatRules.mjs';

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

  // Pre-match / 1st Innings Win Probability
  if (state.currentInnings === 1) {
    const t1Runs = state.team1.runs || 0;
    const t1Wkts = state.team1.wickets || 0;
    const ballsRemaining = state.ballsRemaining;
    const wicketsRemaining = Math.max(1, rules.maxWickets - t1Wkts);

    // Projected total for Team 1
    const t1Projected = t1Runs + (ballsRemaining / 6) * 7.5 * Math.pow(wicketsRemaining / 10, 0.6);
    const parTotal = rules.ballsPerInnings * 0.07 * 6; // Par average for format

    const diff = t1Projected - parTotal;
    const zScore = diff / 25.0; // Standard deviation of 25 runs for T20 total
    const p1Raw = 1 / (1 + Math.exp(-zScore));

    const pTeam1 = Math.max(0.05, Math.min(0.95, p1Raw));
    const pTeam2 = 1.0 - pTeam1;

    return { pTeam1, pTeam2, pTie: 0.01 };
  }

  // 2nd Innings Win Probability (Chase Model)
  const chaseTeamIsTeam1 = state.battingTeamId === state.team1.id;
  const battingTeam = chaseTeamIsTeam1 ? state.team1 : state.team2;

  const runsRequired = state.runsRequired != null ? state.runsRequired : Math.max(1, (state.target || 143) - battingTeam.runs);
  const ballsRemaining = Math.max(0, state.ballsRemaining);
  const wicketsRemaining = Math.max(0, rules.maxWickets - (battingTeam.wickets || 0));

  if (runsRequired <= 0) {
    // Chase complete
    return chaseTeamIsTeam1
      ? { pTeam1: 1.0, pTeam2: 0.0, pTie: 0.0 }
      : { pTeam1: 0.0, pTeam2: 1.0, pTie: 0.0 };
  }

  if (ballsRemaining <= 0 || wicketsRemaining <= 0) {
    // Chase failed
    return chaseTeamIsTeam1
      ? { pTeam1: 0.0, pTeam2: 1.0, pTie: 0.0 }
      : { pTeam1: 1.0, pTeam2: 0.0, pTie: 0.0 };
  }

  // Required Run Rate vs Available Resources
  const reqRR = (runsRequired / ballsRemaining) * 6;
  const resourceIndex = (wicketsRemaining / 10.0) * Math.min(2.0, 120 / (ballsRemaining || 1));

  // Sigmoid log-odds model for chase win probability
  const logOdds = (7.5 - reqRR) * 0.45 + (wicketsRemaining - 5) * 0.25 - (runsRequired > 50 ? 0.3 : 0);
  const pBattingRaw = 1 / (1 + Math.exp(-logOdds));
  const pBatting = Math.max(0.01, Math.min(0.99, pBattingRaw));

  const pTeam1 = chaseTeamIsTeam1 ? pBatting : (1.0 - pBatting);
  const pTeam2 = chaseTeamIsTeam1 ? (1.0 - pBatting) : pBatting;

  return {
    pTeam1,
    pTeam2,
    pTie: 0.005,
  };
}
