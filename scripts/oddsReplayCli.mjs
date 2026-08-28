#!/usr/bin/env node

/**
 * OddsEngineV3 — Deterministic Price Replay CLI
 * 
 * Reconstructs published market odds from canonical match snapshots and versioned parameters.
 * Usage:
 *   node scripts/oddsReplayCli.mjs --match=match_123 --sport=cricket
 */

import { generate } from '../lib/odds-v3/OddsEngineV3.mjs';
import { createCanonicalMatchState } from '../lib/odds-v3/models/CanonicalMatchState.mjs';
import { getActiveModelVersion } from '../lib/odds-v3/registry/modelRegistry.mjs';
import { getActiveParameters } from '../lib/odds-v3/registry/parameterRegistry.mjs';
import { buildPriceExplainabilityRecord } from '../lib/odds-v3/pricing/priceExplainability.mjs';

function parseArgs() {
  const args = process.argv.slice(2);
  const params = {
    matchId: 'replay_match_01',
    sport: 'cricket',
    format: 'T20',
    runs1: 165,
    wickets1: 6,
    runs2: 120,
    wickets2: 4,
    balls2: 84,
    target: 166,
  };

  for (const arg of args) {
    const [k, v] = arg.replace(/^--/, '').split('=');
    if (k && v !== undefined) {
      params[k] = isNaN(Number(v)) ? v : Number(v);
    }
  }
  return params;
}

export function executeDeterministicReplay(inputParams = {}) {
  const params = { ...parseArgs(), ...inputParams };
  const model = getActiveModelVersion(params.sport);
  const parameters = getActiveParameters();

  const canonical = createCanonicalMatchState({
    matchId: params.matchId,
    sport: params.sport.toUpperCase(),
    format: params.format,
    status: 'LIVE',
    team1: { id: 'team1', name: 'Team A', runs: params.runs1, wickets: params.wickets1, balls: 120 },
    team2: { id: 'team2', name: 'Team B', runs: params.runs2, wickets: params.wickets2, balls: params.balls2 },
    currentInnings: 2,
    battingTeamId: 'team2',
    bowlingTeamId: 'team1',
    target: params.target,
    runsRequired: Math.max(0, params.target - params.runs2),
    ballsPerInnings: 120,
    ballsCompleted: params.balls2,
    ballsRemaining: Math.max(0, 120 - params.balls2),
    providerTimestamp: Date.now(),
    stateVersion: 1,
  });

  const snapshot = generate(canonical);
  const winnerMarket = snapshot.markets?.find((m) => m.marketId === 'match_winner');
  const sel1 = winnerMarket?.selections?.[0];

  const explainability = sel1 ? buildPriceExplainabilityRecord({
    matchId: canonical.matchId,
    sport: canonical.sport,
    market: 'match_winner',
    selection: sel1.selectionId,
    baseProbability: sel1.probability,
    providerConsensus: sel1.probability,
    modelBlend: sel1.probability,
    margin: sel1.margin || 0.05,
    finalOdds: sel1.odds,
    engineVersion: '3.0.0',
    modelVersion: model.modelVersion,
    parameterVersion: parameters.version,
  }) : null;

  return {
    matchId: canonical.matchId,
    status: snapshot.status,
    totalMarketsGenerated: snapshot.markets?.length || 0,
    winnerOdds: winnerMarket?.selections?.map((s) => ({ selectionId: s.selectionId, name: s.name, odds: s.odds, prob: s.probability })),
    explainability,
    modelVersion: model.modelVersion,
    parameterVersion: parameters.version,
    replayedAt: new Date().toISOString(),
  };
}

if (process.argv[1] && process.argv[1].endsWith('oddsReplayCli.mjs')) {
  const output = executeDeterministicReplay();
  console.log(JSON.stringify(output, null, 2));
}
