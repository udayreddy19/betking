/**
 * OddsEngineV3 — Explicit Model Governance & Version Registry
 * 
 * Manages model lifecycle statuses, champion/challenger designations,
 * configuration hashes, and immutable rollback metadata.
 * 
 * STRICT INVARIANT: Exactly one AUTHORITATIVE model (Champion: v3.1-prod)
 * is permitted per pricing scope. Automatic promotion is strictly forbidden.
 */

export const MODEL_STATUSES = Object.freeze({
  AUTHORITATIVE: 'AUTHORITATIVE',
  SHADOW: 'SHADOW',
  CANDIDATE: 'CANDIDATE',
  RETIRED: 'RETIRED',
  REJECTED: 'REJECTED',
});

export const MODEL_ROLES = Object.freeze({
  CHAMPION: 'CHAMPION',
  CHALLENGER: 'CHALLENGER',
});

const INITIAL_MODEL_REGISTRY = [
  {
    modelId: 'odds-v3-prod',
    modelVersion: 'v3.1-prod',
    role: MODEL_ROLES.CHAMPION,
    status: MODEL_STATUSES.AUTHORITATIVE,
    createdAt: '2026-08-20T00:00:00.000Z',
    activatedAt: '2026-08-20T00:00:00.000Z',
    retiredAt: null,
    sourceCommit: 'fbfed32',
    configurationHash: 'cfg_sha256_v31prod_baseline',
    featureVersion: 'v3.1',
    trainingDataRange: 'historical_2025_2026',
    notes: 'Authoritative production pricing engine for all live sports.',
  },
  {
    modelId: 'odds-v3-cand-001',
    modelVersion: 'v3.2-candidate-001',
    role: MODEL_ROLES.CHALLENGER,
    status: MODEL_STATUSES.SHADOW,
    createdAt: '2026-08-28T12:00:00.000Z',
    activatedAt: null,
    retiredAt: null,
    sourceCommit: '9eaa425',
    configurationHash: 'cfg_sha256_cand001_covariance',
    featureVersion: 'v3.2',
    trainingDataRange: 'shadow_staging_2026',
    notes: 'Covariance-Aware Provider Blending with collinearity shrinkage.',
  },
  {
    modelId: 'odds-v3-cand-002',
    modelVersion: 'v3.2-candidate-002',
    role: MODEL_ROLES.CHALLENGER,
    status: MODEL_STATUSES.SHADOW,
    createdAt: '2026-08-28T12:00:00.000Z',
    activatedAt: null,
    retiredAt: null,
    sourceCommit: '9eaa425',
    configurationHash: 'cfg_sha256_cand002_regime',
    featureVersion: 'v3.2',
    trainingDataRange: 'shadow_staging_2026',
    notes: 'Regime-Specific Bayesian Dynamic Weighting.',
  },
  {
    modelId: 'odds-v3-cand-004',
    modelVersion: 'v3.2-candidate-004',
    role: MODEL_ROLES.CHALLENGER,
    status: MODEL_STATUSES.SHADOW,
    createdAt: '2026-08-28T12:00:00.000Z',
    activatedAt: null,
    retiredAt: null,
    sourceCommit: '9eaa425',
    configurationHash: 'cfg_sha256_cand004_cricket',
    featureVersion: 'v3.2',
    trainingDataRange: 'shadow_staging_2026',
    notes: 'Advanced Cricket State Model with death-overs physics.',
  },
  {
    modelId: 'odds-v3-cand-pipeline',
    modelVersion: 'v3.2-candidate-pipeline',
    role: MODEL_ROLES.CHALLENGER,
    status: MODEL_STATUSES.SHADOW,
    createdAt: '2026-08-28T17:00:00.000Z',
    activatedAt: null,
    retiredAt: null,
    sourceCommit: '7261706',
    configurationHash: 'cfg_sha256_cand_pipeline_phase24',
    featureVersion: 'v3.2',
    trainingDataRange: 'shadow_staging_2026',
    notes: 'End-to-End Candidate Pricing Pipeline with Quality & Noise Suppression.',
  },
];

let modelRegistry = [...INITIAL_MODEL_REGISTRY];

/**
 * Returns all registered model versions.
 */
export function listRegisteredModels() {
  return [...modelRegistry];
}

/**
 * Returns the single authoritative production Champion model.
 */
export function getAuthoritativeChampionModel() {
  const champion = modelRegistry.find((m) => m.status === MODEL_STATUSES.AUTHORITATIVE);
  if (!champion) {
    throw new Error('CRITICAL_REGISTRY_ERROR: No authoritative model found.');
  }
  return champion;
}

/**
 * Returns all active challenger candidate models in shadow execution.
 */
export function listShadowChallengerModels() {
  return modelRegistry.filter((m) => m.status === MODEL_STATUSES.SHADOW);
}

/**
 * Validates whether a model transition is legally permissible.
 * FORBIDS automatic promotion without manual operator sign-off.
 */
export function validateModelTransition({ targetModelVersion, action, operatorId }) {
  if (action === 'PROMOTE_TO_AUTHORITATIVE') {
    if (!operatorId) {
      return {
        allowed: false,
        reason: 'MANUAL_OPERATOR_APPROVAL_REQUIRED: Auto-promotion is strictly forbidden.',
      };
    }
  }

  return {
    allowed: true,
    targetModelVersion,
    action,
    validatedAt: new Date().toISOString(),
  };
}
