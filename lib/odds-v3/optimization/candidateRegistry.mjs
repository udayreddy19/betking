/**
 * OddsEngineV3 — Candidate Optimization Registry
 * 
 * Manages candidate model definitions, metadata, backtest status,
 * and approval lifecycles strictly in offline/shadow mode.
 * 
 * ABSOLUTE POLICY:
 * Candidates CANNOT publish odds directly to bettors, alter betslips,
 * or mutate wallets, ledgers, bets, settlements, or payment workflows.
 */

export const CANDIDATE_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  BACKTESTING: 'BACKTESTING',
  SHADOW: 'SHADOW',
  PASS: 'PASS',
  FAIL: 'FAIL',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA',
  APPROVAL_REQUIRED: 'APPROVAL_REQUIRED',
  REJECTED: 'REJECTED',
});

const candidateStore = new Map();

const DEFAULT_CANDIDATES = [
  {
    id: 'v3.2-candidate-001',
    name: 'Covariance-Aware Provider Blending',
    description: 'Adjusts multi-provider weights based on empirical cross-feed correlation (rho ~ 0.82) to avoid double-counting.',
    baselineVersion: 'v3.1-prod',
    parameterVersion: 'params_v3.2_cand001',
    datasetVersion: 'ds_phase22_live_v1',
    status: CANDIDATE_STATUS.SHADOW,
    createdAt: '2026-08-28T00:00:00.000Z',
    evaluationStatus: 'PENDING_LONGITUDINAL_DATA',
    approvalStatus: 'NONE',
    metrics: { brierDelta: -0.012, eceDelta: -0.008, latencyP95: 1.15 },
  },
  {
    id: 'v3.2-candidate-002',
    name: 'Regime-Specific Model Blending',
    description: 'Dynamic Bayesian shrinkage conditioned on match phase (Early Game, Death Overs, High Disagreement).',
    baselineVersion: 'v3.1-prod',
    parameterVersion: 'params_v3.2_cand002',
    datasetVersion: 'ds_phase22_live_v1',
    status: CANDIDATE_STATUS.SHADOW,
    createdAt: '2026-08-28T00:00:00.000Z',
    evaluationStatus: 'PENDING_LONGITUDINAL_DATA',
    approvalStatus: 'NONE',
    metrics: { brierDelta: -0.015, eceDelta: -0.011, latencyP95: 1.22 },
  },
  {
    id: 'v3.2-candidate-003',
    name: 'Adaptive Volatility Calibration',
    description: 'Information-preserving volatility filter distinguishing real match events from feed flicker.',
    baselineVersion: 'v3.1-prod',
    parameterVersion: 'params_v3.2_cand003',
    datasetVersion: 'ds_phase22_live_v1',
    status: CANDIDATE_STATUS.SHADOW,
    createdAt: '2026-08-28T00:00:00.000Z',
    evaluationStatus: 'PENDING_LONGITUDINAL_DATA',
    approvalStatus: 'NONE',
    metrics: { brierDelta: -0.009, eceDelta: -0.006, latencyP95: 1.18 },
  },
  {
    id: 'v3.2-candidate-004',
    name: 'Advanced Cricket State Model',
    description: 'Incorporates verified canonical features (powerplay/death phase, partnership pace) while preserving strict monotonicity.',
    baselineVersion: 'v3.1-prod',
    parameterVersion: 'params_v3.2_cand004',
    datasetVersion: 'ds_phase22_live_v1',
    status: CANDIDATE_STATUS.SHADOW,
    createdAt: '2026-08-28T00:00:00.000Z',
    evaluationStatus: 'PENDING_LONGITUDINAL_DATA',
    approvalStatus: 'NONE',
    metrics: { brierDelta: -0.018, eceDelta: -0.014, latencyP95: 1.25 },
  },
  {
    id: 'v3.2-candidate-005',
    name: 'Market-Specific Calibration',
    description: 'Segmented Platt and Temperature scaling tailored per sport and market volatility class.',
    baselineVersion: 'v3.1-prod',
    parameterVersion: 'params_v3.2_cand005',
    datasetVersion: 'ds_phase22_live_v1',
    status: CANDIDATE_STATUS.SHADOW,
    createdAt: '2026-08-28T00:00:00.000Z',
    evaluationStatus: 'PENDING_LONGITUDINAL_DATA',
    approvalStatus: 'NONE',
    metrics: { brierDelta: -0.011, eceDelta: -0.009, latencyP95: 1.16 },
  },
];

for (const c of DEFAULT_CANDIDATES) {
  candidateStore.set(c.id, c);
}

export function registerCandidate(candidateDef) {
  if (!candidateDef?.id || !candidateDef?.name) {
    throw new Error('Invalid candidate definition: id and name are required.');
  }
  const record = {
    ...candidateDef,
    status: CANDIDATE_STATUS[candidateDef.status] || CANDIDATE_STATUS.DRAFT,
    createdAt: candidateDef.createdAt || new Date().toISOString(),
  };
  candidateStore.set(record.id, record);
  return { ...record };
}

export function getCandidate(id) {
  return candidateStore.get(id) ? { ...candidateStore.get(id) } : null;
}

export function listCandidates() {
  return Array.from(candidateStore.values()).map((c) => ({ ...c }));
}

export function updateCandidateStatus(id, newStatus, { reason = '', approvedBy = null } = {}) {
  const candidate = candidateStore.get(id);
  if (!candidate) throw new Error(`Candidate ${id} not found.`);
  const status = CANDIDATE_STATUS[newStatus];
  if (!status) throw new Error(`Invalid candidate status: ${newStatus}`);

  candidate.status = status;
  if (approvedBy && status === CANDIDATE_STATUS.APPROVAL_REQUIRED) {
    candidate.approvalStatus = {
      approvedBy,
      approvedAt: new Date().toISOString(),
      reason,
    };
  }
  return { ...candidate };
}

export function resetCandidateRegistry() {
  candidateStore.clear();
  for (const c of DEFAULT_CANDIDATES) {
    candidateStore.set(c.id, { ...c });
  }
}
