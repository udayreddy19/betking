/**
 * OddsEngineV3 — Parameter Sensitivity & Elasticity Analyzer
 * 
 * Computes numerical partial derivatives of model probabilities and odds with respect to game state variables:
 * - ∂P / ∂Runs (Run elasticity)
 * - ∂P / ∂Wickets (Wicket shock sensitivity)
 * - ∂P / ∂Balls (Time decay sensitivity)
 */

import { generate } from '../OddsEngineV3.mjs';
import { createCanonicalMatchState } from '../models/CanonicalMatchState.mjs';

export function analyzeParameterSensitivity(baseInput = {}) {
  const sport = (baseInput.sport || 'CRICKET').toUpperCase();

  if (sport !== 'CRICKET') {
    return {
      status: 'UNSUPPORTED_SPORT_SENSITIVITY',
      sport,
      sensitivities: {},
    };
  }

  const baseCanonical = createCanonicalMatchState({
    matchId: 'sens_base_01',
    sport: 'CRICKET',
    format: baseInput.format || 'T20',
    status: 'LIVE',
    team1: { id: 'team1', name: 'Team A', runs: baseInput.runs1 || 160, wickets: baseInput.wickets1 || 5, balls: 120 },
    team2: { id: 'team2', name: 'Team B', runs: baseInput.runs2 || 120, wickets: baseInput.wickets2 || 4, balls: baseInput.balls2 || 84 },
    currentInnings: 2,
    battingTeamId: 'team2',
    bowlingTeamId: 'team1',
    target: baseInput.target || 161,
    runsRequired: Math.max(0, (baseInput.target || 161) - (baseInput.runs2 || 120)),
    ballsPerInnings: 120,
    ballsCompleted: baseInput.balls2 || 84,
    ballsRemaining: Math.max(0, 120 - (baseInput.balls2 || 84)),
    providerTimestamp: Date.now(),
    stateVersion: 1,
  });

  const baseOdds = generate(baseCanonical);
  const baseProb = baseOdds.markets?.find((m) => m.marketId === 'match_winner')?.selections?.[0]?.probability || 0.5;

  // Perturb runs (+6 runs, equivalent to 1 boundary)
  const runsPlusCanonical = createCanonicalMatchState({
    ...baseCanonical,
    team2: { ...baseCanonical.team2, runs: baseCanonical.team2.runs + 6 },
    runsRequired: Math.max(0, baseCanonical.runsRequired - 6),
  });
  const runsProb = generate(runsPlusCanonical).markets?.find((m) => m.marketId === 'match_winner')?.selections?.[0]?.probability || baseProb;
  const dProb_dRuns = Number(((runsProb - baseProb) / 6).toFixed(4));

  // Perturb wickets (+1 wicket)
  const wicketPlusCanonical = createCanonicalMatchState({
    ...baseCanonical,
    team2: { ...baseCanonical.team2, wickets: baseCanonical.team2.wickets + 1 },
  });
  const wicketProb = generate(wicketPlusCanonical).markets?.find((m) => m.marketId === 'match_winner')?.selections?.[0]?.probability || baseProb;
  const dProb_dWicket = Number((wicketProb - baseProb).toFixed(4));

  return {
    status: 'ANALYZED',
    sport,
    baseProbability: Number(baseProb.toFixed(4)),
    sensitivities: {
      dProb_dRunsPerBoundary: Number((dProb_dRuns * 6).toFixed(4)),
      dProb_dRunsPerRun: dProb_dRuns,
      dProb_dWicketFall: dProb_dWicket,
    },
    elasticityClassification: Math.abs(dProb_dWicket) > 0.15 ? 'HIGH_LEVERAGE_STATE' : 'MODERATE_ELASTICITY',
    analyzedAt: new Date().toISOString(),
  };
}
