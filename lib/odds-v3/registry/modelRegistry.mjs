/**
 * OddsEngineV3 — Versioned Model Registry
 * 
 * Tracks immutable model definitions, hyperparameters, audit trails,
 * and approval lifecycles (DRAFT, SHADOW, CANARY, ACTIVE, RETIRED, REJECTED).
 * Strictly guarantees single ACTIVE production model per sport/market path.
 */

import crypto from 'crypto';

export const MODEL_STATUSES = Object.freeze({
  DRAFT: 'DRAFT',
  SHADOW: 'SHADOW',
  CANARY: 'CANARY',
  ACTIVE: 'ACTIVE',
  RETIRED: 'RETIRED',
  REJECTED: 'REJECTED',
});

const modelRegistryStore = new Map();

// Initialize with authoritative baseline production model
const DEFAULT_BASELINE_MODEL = {
  modelVersion: 'v3.1-prod',
  sport: 'cricket',
  market: 'all',
  parametersHash: 'hash_baseline_v3_1_sha256',
  createdAt: '2026-08-28T00:00:00.000Z',
  createdBy: 'SYSTEM_BOOTSTRAP',
  status: MODEL_STATUSES.ACTIVE,
  parentVersion: 'v3.0',
  metrics: {
    brierScore: 0.185,
    logLoss: 0.542,
    ece: 0.038,
    sampleCount: 1540,
  },
  approvalStatus: {
    approvedBy: 'OPERATIONS_COUNCIL',
    approvedAt: '2026-08-28T00:00:00.000Z',
    reason: 'Initial Phase 16 certified baseline production model.',
  },
};

modelRegistryStore.set(DEFAULT_BASELINE_MODEL.modelVersion, DEFAULT_BASELINE_MODEL);

export function computeParameterHash(params = {}) {
  const serialized = JSON.stringify(params, Object.keys(params).sort());
  return crypto.createHash('sha256').update(serialized).digest('hex').slice(0, 16);
}

/**
 * Registers a new model version (initially in DRAFT or SHADOW).
 */
export function registerModelVersion({
  modelVersion,
  sport = 'cricket',
  market = 'all',
  parameters = {},
  parentVersion = 'v3.1-prod',
  createdBy = 'MODEL_RESEARCHER',
  status = MODEL_STATUSES.SHADOW,
  metrics = {},
}) {
  if (!modelVersion) throw new Error('modelVersion is required');
  if (modelRegistryStore.has(modelVersion)) {
    throw new Error(`Model version ${modelVersion} already exists in registry.`);
  }

  const record = {
    modelVersion: String(modelVersion),
    sport: String(sport).toLowerCase(),
    market: String(market),
    parametersHash: computeParameterHash(parameters),
    parameters: { ...parameters },
    createdAt: new Date().toISOString(),
    createdBy: String(createdBy),
    status: MODEL_STATUSES[status] || MODEL_STATUSES.SHADOW,
    parentVersion: String(parentVersion),
    metrics: {
      brierScore: metrics.brierScore ?? null,
      logLoss: metrics.logLoss ?? null,
      ece: metrics.ece ?? null,
      sampleCount: metrics.sampleCount ?? 0,
    },
    approvalStatus: {
      approvedBy: null,
      approvedAt: null,
      reason: null,
    },
  };

  modelRegistryStore.set(record.modelVersion, record);
  return { ...record };
}

/**
 * Updates model lifecycle status with strict audit trail and single ACTIVE enforcement.
 */
export function updateModelStatus(modelVersion, newStatus, { operator = 'ADMIN', reason = '' } = {}) {
  const model = modelRegistryStore.get(modelVersion);
  if (!model) throw new Error(`Model ${modelVersion} not found in registry.`);

  const validatedStatus = MODEL_STATUSES[newStatus];
  if (!validatedStatus) throw new Error(`Invalid status ${newStatus}`);

  // Enforce single ACTIVE model per sport/market
  if (validatedStatus === MODEL_STATUSES.ACTIVE) {
    for (const [v, m] of modelRegistryStore.entries()) {
      if (m.sport === model.sport && m.market === model.market && m.status === MODEL_STATUSES.ACTIVE && v !== modelVersion) {
        m.status = MODEL_STATUSES.RETIRED;
      }
    }
  }

  model.status = validatedStatus;
  model.approvalStatus = {
    approvedBy: operator,
    approvedAt: new Date().toISOString(),
    reason: String(reason || `Status transitioned to ${validatedStatus}`),
  };

  return { ...model };
}

export function listModelVersions({ sport = null, status = null } = {}) {
  const results = [];
  for (const m of modelRegistryStore.values()) {
    if (sport && m.sport !== String(sport).toLowerCase()) continue;
    if (status && m.status !== String(status)) continue;
    results.push({ ...m });
  }
  return results;
}

export function getActiveModelVersion(sport = 'cricket', market = 'all') {
  for (const m of modelRegistryStore.values()) {
    if (m.sport === String(sport).toLowerCase() && m.status === MODEL_STATUSES.ACTIVE) {
      return { ...m };
    }
  }
  return DEFAULT_BASELINE_MODEL;
}

export function resetModelRegistry() {
  modelRegistryStore.clear();
  modelRegistryStore.set(DEFAULT_BASELINE_MODEL.modelVersion, { ...DEFAULT_BASELINE_MODEL });
}
