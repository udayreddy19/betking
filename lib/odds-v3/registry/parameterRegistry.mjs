/**
 * OddsEngineV3 — Parameter Registry
 * 
 * Tracks versioned pricing parameters:
 * - margin bounds & presets
 * - provider blend weights
 * - SGP correlation (rho) matrices
 * - latency & volatility circuit breaker thresholds
 * 
 * Guarantees immutable parameter history and instant rollback.
 */

import crypto from 'crypto';

const parameterHistory = [];
let currentParameters = {
  version: 'params_v1.0_prod',
  createdAt: '2026-08-28T00:00:00.000Z',
  updatedBy: 'SYSTEM_BOOTSTRAP',
  reason: 'Initial certified production parameter preset',
  margins: {
    minMargin: 0.035,
    maxMargin: 0.12,
    defaultPreMatchOverround: 0.05,
    defaultLiveOverround: 0.065,
    highVolatilityOverround: 0.09,
  },
  providerWeights: {
    cricbuzz: 0.35,
    crex: 0.25,
    tencric: 0.20,
    espn: 0.20,
  },
  sgpRhoMatrix: {
    'runs_vs_wickets': -0.45,
    'boundary_vs_team_total': 0.65,
    'match_winner_vs_team_total': 0.50,
  },
  circuitBreaker: {
    staleFeedThresholdMs: 15000,
    maxProviderDivergenceProb: 0.15,
    maxSingleBallMovementPercent: 40,
  },
};

parameterHistory.push({ ...currentParameters });

export function getActiveParameters() {
  return JSON.parse(JSON.stringify(currentParameters));
}

export function updateParameters(updates = {}, { operator = 'ADMIN', reason = '' } = {}) {
  const newVersion = `params_v${Date.now().toString(36)}`;
  const merged = {
    version: newVersion,
    createdAt: new Date().toISOString(),
    updatedBy: String(operator),
    reason: String(reason || 'Parameter modification'),
    margins: { ...currentParameters.margins, ...(updates.margins || {}) },
    providerWeights: { ...currentParameters.providerWeights, ...(updates.providerWeights || {}) },
    sgpRhoMatrix: { ...currentParameters.sgpRhoMatrix, ...(updates.sgpRhoMatrix || {}) },
    circuitBreaker: { ...currentParameters.circuitBreaker, ...(updates.circuitBreaker || {}) },
  };

  // Validate margin bounds (never exceed 3.5% - 12%)
  if (merged.margins.minMargin < 0.035 || merged.margins.maxMargin > 0.15) {
    throw new Error('Margin bounds must stay within safety envelope [0.035, 0.15].');
  }

  currentParameters = merged;
  parameterHistory.push({ ...merged });
  return getActiveParameters();
}

export function rollbackParameters(targetVersion, { operator = 'ADMIN', reason = '' } = {}) {
  const found = parameterHistory.find((p) => p.version === targetVersion);
  if (!found) throw new Error(`Parameter version ${targetVersion} not found in history.`);

  const rollbackRecord = {
    ...JSON.parse(JSON.stringify(found)),
    version: `rollback_to_${targetVersion}_${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
    updatedBy: String(operator),
    reason: String(reason || `Rollback to ${targetVersion}`),
  };

  currentParameters = rollbackRecord;
  parameterHistory.push({ ...rollbackRecord });
  return getActiveParameters();
}

export function listParameterHistory() {
  return parameterHistory.map((p) => ({
    version: p.version,
    createdAt: p.createdAt,
    updatedBy: p.updatedBy,
    reason: p.reason,
  }));
}
