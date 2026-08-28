/**
 * Production Certification — Phase 8/9/10/11.
 * Extends productionReadinessEngine. Does NOT create a second readiness platform.
 * Never auto-repairs wallets/ledger. Never force-GREEN.
 * LOCAL/STAGING evidence NEVER satisfies PRODUCTION gates.
 * Stale / malformed / cross-env / stub PASS evidence → NOT_VERIFIED (or BLOCKED).
 * Phase 11 evidence wins over older phases when present.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { buildProductionReadiness } from './productionReadinessEngine.mjs';
import {
  PHASE8_EVIDENCE_DIR,
  PHASE9_EVIDENCE_DIR,
  PHASE10_EVIDENCE_DIR,
  PHASE11_EVIDENCE_DIR,
  mapReadinessToCertStatus,
  readLatestEvidencePreferPhase11,
  listPhase8EvidenceFiles,
  listPhase9EvidenceFiles,
  listPhase10EvidenceFiles,
  listPhase11EvidenceFiles,
  gitCommitSafe,
  evidenceMatchesClaim,
  validateEvidenceForClaim,
} from './certificationEvidence.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Gates that must be PASS for productionClaimAllowed (Phase 9) */
export const MANDATORY_PRODUCTION_GATES = Object.freeze([
  'CORE',
  'TESTS',
  'BUILD',
  'DATABASE',
  'MIGRATIONS',
  'SECURITY',
  'AUTHENTICATION',
  'MFA',
  'RBAC',
  'CSRF',
  'FINANCE',
  'LEDGER',
  'RECONCILIATION',
  'TEST_FUNDING',
  'PROMOTIONS',
  'CRM',
  'WORKERS',
  'OUTBOX',
  'REDIS',
  'WEBSOCKET',
  'BACKUP',
  'DR',
  'PITR',
  'RPO',
  'RTO',
  'MONITORING',
  'DEPLOYMENT',
  'PRODUCTION_SMOKE',
  'AUDIT_LOGGING',
  'SECRETS',
  'CONFIGURATION',
]);

/** Gates whose PASS/FAIL from connected readiness DB must not imply production without evidence */
const DB_BOUND_GATES = new Set([
  'DATABASE', 'MIGRATIONS', 'FINANCE', 'LEDGER', 'RECONCILIATION', 'TEST_FUNDING',
  'WALLET', 'TEST_FUNDING_CLEANUP', 'WITHDRAWALS', 'ALERTING', 'SETTLEMENT', 'DEPOSITS',
]);

const EVIDENCE_GATE_MAP = {
  MFA: 'security',
  RBAC: 'security',
  CSRF: 'security',
  AUTHENTICATION: 'security',
  SECURITY: 'security',
  AUDIT_LOGGING: 'security',
  PITR: 'pitr',
  RPO: 'rpo',
  RTO: 'rto',
  DR: 'dr',
  BACKUP: 'backup',
  DEPLOYMENT: 'deployment',
  PRODUCTION_SMOKE: 'production-smoke',
  TEST_FUNDING: 'test-funding',
  LEDGER: 'ledger',
  FINANCE: 'ledger',
  RECONCILIATION: 'reconciliation',
  DATABASE: 'database',
  MIGRATIONS: 'migrations',
  WORKERS: 'workers',
  OUTBOX: 'outbox',
  REDIS: 'redis',
  WEBSOCKET: 'websocket',
  MONITORING: 'monitoring',
  SECRETS: 'secrets',
  CONFIGURATION: 'configuration',
  CORE: 'production-smoke',
  PROMOTIONS: 'promotions',
  CRM: 'crm',
};

function evidenceDirForPhase(phase) {
  if (phase === 11) return PHASE11_EVIDENCE_DIR;
  if (phase === 10) return PHASE10_EVIDENCE_DIR;
  if (phase === 9) return PHASE9_EVIDENCE_DIR;
  return PHASE8_EVIDENCE_DIR;
}

function loadEvidenceBundle() {
  const names = [
    'database', 'migrations', 'test-funding', 'ledger', 'reconciliation', 'security',
    'authentication', 'mfa', 'rbac', 'csrf',
    'production-smoke', 'workers', 'outbox', 'redis', 'websocket',
    'dr', 'pitr', 'rpo', 'rto', 'backup', 'monitoring', 'deployment',
    'secrets', 'configuration', 'promotions', 'crm', 'audit-logging',
  ];
  const bundle = {};
  for (const n of names) {
    const doc = readLatestEvidencePreferPhase11(n);
    if (doc) {
      const dir = evidenceDirForPhase(doc._phase);
      doc._path = path.relative(ROOT, path.join(dir, `${n}_latest.json`));
      if (!doc._evidenceSource) doc._evidenceSource = doc._path;
      bundle[n] = doc;
    }
  }
  return bundle;
}

/** Dump restore alone cannot satisfy PITR / production-class RPO/RTO. */
function isDumpOnlyDrEvidence(ev) {
  if (!ev || typeof ev !== 'object') return false;
  const method = String(ev.restoreMethod || ev.method || ev.verificationMethod || '').toLowerCase();
  const envClass = String(ev.restore_environment || ev.restoreEnvironment || ev.environmentClass || '').toUpperCase();
  if (envClass === 'PRODUCTION_CLASS_PITR') return false;
  if (method.includes('dump') || method.includes('pg_dump') || ev.dumpOnly === true) return true;
  if (ev.pitr === false && (ev.dumpRestore === true || method.includes('sql'))) return true;
  return false;
}

function isStubEvidence(ev) {
  const method = String(ev?.verificationMethod || '').toLowerCase();
  return Boolean(
    ev?.stub === true
    || method === 'stub'
    || method === 'phase10_stub'
    || method === 'phase11_stub'
    || ev?.resultSource === 'stub',
  );
}

function isProcessLocalMonitoring(ev) {
  const backend = String(ev?.metricsBackend || ev?.checks?.metricsBackend || ev?.monitoringClass || '').toUpperCase();
  return backend === 'PROCESS_LOCAL' || ev?.processLocal === true;
}

function extractGateResult(ev, gateName) {
  const gateSlice = ev.gates?.[gateName] || ev.checks?.[gateName];
  if (typeof gateSlice === 'string') return gateSlice;
  if (gateSlice && (gateSlice.status || gateSlice.result)) return gateSlice.status || gateSlice.result;
  return ev.result || null;
}

function certGateFromReadiness(g, envLabel, evidenceBundle) {
  const required = MANDATORY_PRODUCTION_GATES.includes(g.id);
  const isProdOrStaging = envLabel === 'production' || envLabel === 'staging';
  let status = mapReadinessToCertStatus(g.status);
  let verified = false;
  let evidenceId = null;
  let evidencePath = null;
  let evidenceTimestamp = null;
  let expiresAt = null;
  let verifiedBy = null;
  let verificationMethod = null;
  let evidenceEnvironment = null;
  let reason = g.explanation || g.remediation || '';
  let notes = reason;
  const blockers = [];

  // Phase 9/10: readiness PASS/FAIL from connected (often local) DB must not certify production
  if (isProdOrStaging) {
    if (status === 'PASS') {
      status = 'NOT_VERIFIED';
      notes = (notes ? `${notes}; ` : '') + 'Readiness PASS ignored for production/staging claim without matching evidence';
      reason = notes;
    }
    if (DB_BOUND_GATES.has(g.id) && (status === 'FAIL' || status === 'PASS')) {
      status = 'NOT_VERIFIED';
      notes = (notes ? `${notes}; ` : '') + 'Connected-DB readiness result is not production evidence';
      reason = notes;
    }
  }

  const evidenceKey = EVIDENCE_GATE_MAP[g.id];
  const ev = evidenceKey ? evidenceBundle[evidenceKey] : null;
  if (ev) {
    const validation = validateEvidenceForClaim(ev, envLabel);
    evidenceEnvironment = ev.environment || null;
    evidencePath = ev._path || null;
    evidenceId = ev.evidenceId || ev.timestamp || null;
    evidenceTimestamp = validation.evidenceTimestamp || ev.timestamp || null;
    expiresAt = validation.expiresAt || ev.expiresAt || null;
    verifiedBy = validation.verifiedBy || null;
    verificationMethod = validation.verificationMethod || null;

    if (!validation.valid) {
      status = validation.statusHint || 'NOT_VERIFIED';
      notes = (notes ? `${notes}; ` : '') + (validation.reason || 'invalid_evidence');
      reason = notes;
      verified = false;
    } else {
      const result = extractGateResult(ev, g.id);
      if (ev.blocked || String(result).toUpperCase() === 'BLOCKED') {
        status = 'BLOCKED';
        notes = ev.blockReason || notes;
        reason = notes;
      } else if (isStubEvidence(ev) || validation.stub) {
        // Phase 11: stubs never satisfy mandatory production gates (any status → NOT_VERIFIED for PASS path)
        const mappedStub = result ? mapReadinessToCertStatus(result) : 'NOT_VERIFIED';
        if (mappedStub === 'PASS' || isProdOrStaging) {
          status = mappedStub === 'BLOCKED' ? 'BLOCKED' : (mappedStub === 'FAIL' ? 'FAIL' : 'NOT_VERIFIED');
          if (mappedStub === 'PASS') status = 'NOT_VERIFIED';
          notes = 'Stub verification cannot satisfy production gate';
          reason = notes;
          verified = false;
        } else if (result) {
          status = mappedStub === 'OUT_OF_SCOPE' && g.id !== 'PAYMENTS' ? 'NOT_VERIFIED' : mappedStub;
          notes = ev.gates?.[g.id]?.notes || ev.notes || notes;
          reason = notes;
        }
      } else if (
        (g.id === 'PITR' || g.id === 'RPO' || g.id === 'RTO')
        && isDumpOnlyDrEvidence(ev)
      ) {
        status = 'NOT_VERIFIED';
        notes = 'SQL dump restore is not PITR evidence; PRODUCTION_CLASS_PITR required';
        reason = notes;
        verificationMethod = 'rejected_dump_only';
      } else if (g.id === 'MONITORING' && isProcessLocalMonitoring(ev)) {
        status = 'NOT_VERIFIED';
        notes = 'PROCESS_LOCAL telemetry is not distributed production monitoring';
        reason = notes;
      } else if (result) {
        const mapped = mapReadinessToCertStatus(result);
        if (mapped === 'PASS') {
          // Extra hard reject: production DB identity must be proven for DATABASE
          if (g.id === 'DATABASE' && isProdOrStaging && ev.checks?.identityProven !== true && ev.identityProven !== true) {
            status = 'NOT_VERIFIED';
            notes = 'Production database identity not proven (identityProven !== true)';
            reason = notes;
            verified = false;
          } else {
            status = 'PASS';
            verified = true;
            notes = ev.gates?.[g.id]?.notes || ev.notes || notes;
            reason = notes;
            verifiedBy = verifiedBy || ev.verifiedBy || ev.operator || 'phase11-evidence';
            verificationMethod = verificationMethod || 'file_evidence';
          }
        } else if (mapped === 'FAIL' || mapped === 'BLOCKED' || mapped === 'NOT_VERIFIED' || mapped === 'OUT_OF_SCOPE') {
          status = mapped === 'OUT_OF_SCOPE' && g.id !== 'PAYMENTS' ? 'NOT_VERIFIED' : mapped;
          notes = ev.gates?.[g.id]?.notes || ev.notes || notes;
          reason = notes;
        }
      } else if (!result) {
        status = 'NOT_VERIFIED';
        notes = (notes ? `${notes}; ` : '') + 'evidence_missing_gate_result';
        reason = notes;
      }
    }
  }

  if (required && (status === 'FAIL' || status === 'NOT_VERIFIED' || status === 'BLOCKED')) {
    blockers.push(`${g.id}:${status}`);
  }

  let evidenceAgeMs = null;
  if (evidenceTimestamp) {
    const t = Date.parse(evidenceTimestamp);
    if (Number.isFinite(t)) evidenceAgeMs = Math.max(0, Date.now() - t);
  }

  return {
    gate: g.id,
    name: g.id,
    label: g.label,
    environment: envLabel,
    status,
    required,
    evidence: evidencePath ? { path: evidencePath, id: evidenceId, source: ev?._evidenceSource || evidencePath } : null,
    evidenceTimestamp,
    evidenceAgeMs,
    evidenceAgeHuman: evidenceAgeMs != null ? `${Math.round(evidenceAgeMs / 3600000)}h` : null,
    evidenceSource: ev?._evidenceSource || evidencePath || null,
    evidenceEnvironment,
    expiresAt,
    reason,
    verifiedBy,
    verificationMethod: verificationMethod || (verified ? 'file_evidence' : 'productionReadinessEngine'),
    verified,
    evidenceId,
    evidencePath,
    timestamp: evidenceTimestamp || g.evidence?.checkedAt || g.evidence?.timestamp || new Date().toISOString(),
    verifier: verifiedBy || (verified ? 'phase11-evidence' : 'productionReadinessEngine'),
    notes,
    blockers,
    readinessStatus: g.status,
    severity: g.severity,
    blocking: Boolean(g.blocking) || blockers.length > 0,
  };
}

/**
 * @param {{ environment?: string, readiness?: object }} opts
 */
export async function buildProductionCertification(opts = {}) {
  const envLabel = String(opts.environment || process.env.READINESS_ENV || 'local').toLowerCase();
  const isProd = envLabel === 'production';
  const isStaging = envLabel === 'staging';

  const readiness = opts.readiness || await buildProductionReadiness({ environment: envLabel });
  const evidenceBundle = loadEvidenceBundle();
  const evidenceFiles = [
    ...listPhase11EvidenceFiles().map((f) => `phase11/${f}`),
    ...listPhase10EvidenceFiles().map((f) => `phase10/${f}`),
    ...listPhase9EvidenceFiles().map((f) => `phase9/${f}`),
    ...listPhase8EvidenceFiles().map((f) => `phase8/${f}`),
  ];

  const gates = (readiness.gates || []).map((g) => certGateFromReadiness(g, envLabel, evidenceBundle));
  const byName = new Map(gates.map((g) => [g.name, g]));

  if (!byName.has('AUTHENTICATION') && byName.has('AUTH')) {
    const a = { ...byName.get('AUTH'), name: 'AUTHENTICATION', gate: 'AUTHENTICATION', required: true };
    gates.push(a);
    byName.set('AUTHENTICATION', a);
  }
  if (!byName.has('CONFIGURATION')) {
    const sec = byName.get('SECRETS') || byName.get('SECURITY');
    gates.push({
      gate: 'CONFIGURATION',
      name: 'CONFIGURATION',
      label: 'Configuration',
      environment: envLabel,
      status: isProd || isStaging ? 'NOT_VERIFIED' : (sec ? sec.status : 'NOT_VERIFIED'),
      required: true,
      evidence: null,
      evidenceTimestamp: null,
      evidenceEnvironment: null,
      expiresAt: null,
      reason: 'Requires configuration evidence for claimed environment',
      verifiedBy: null,
      verificationMethod: 'derived',
      verified: false,
      evidenceId: null,
      evidencePath: evidenceBundle.configuration?._path || null,
      timestamp: new Date().toISOString(),
      verifier: 'derived',
      notes: 'Requires configuration evidence for claimed environment',
      blockers: [`CONFIGURATION:NOT_VERIFIED`],
      readinessStatus: sec?.readinessStatus,
    });
  }
  if (!byName.has('BACKUP')) {
    const dr = byName.get('DR') || byName.get('BACKUPS');
    gates.push({
      gate: 'BACKUP',
      name: 'BACKUP',
      label: 'Backup',
      environment: envLabel,
      status: isProd || isStaging ? 'NOT_VERIFIED' : mapReadinessToCertStatus(dr?.readinessStatus || 'NOT VERIFIED'),
      required: true,
      evidence: null,
      evidenceTimestamp: null,
      evidenceEnvironment: null,
      expiresAt: null,
      reason: 'Backup PASS requires restore-capable evidence, not existence alone',
      verifiedBy: null,
      verificationMethod: 'derived',
      verified: false,
      evidenceId: null,
      evidencePath: evidenceBundle.backup?._path || evidenceBundle.dr?._path || null,
      timestamp: new Date().toISOString(),
      verifier: 'derived',
      notes: 'Backup PASS requires restore-capable evidence, not existence alone',
      blockers: [],
    });
  }

  // Extra Phase 10 hard rejects on DR evidence even if gate already mapped
  for (const gateName of ['PITR', 'RPO', 'RTO']) {
    const g = byName.get(gateName);
    const ev = evidenceBundle[EVIDENCE_GATE_MAP[gateName]];
    if (g && ev && isDumpOnlyDrEvidence(ev) && g.status === 'PASS') {
      g.status = 'NOT_VERIFIED';
      g.reason = 'SQL dump restore is not PITR evidence; PRODUCTION_CLASS_PITR required';
      g.notes = g.reason;
      g.verified = false;
    }
  }
  const mon = byName.get('MONITORING');
  const monEv = evidenceBundle.monitoring;
  if (mon && monEv && isProcessLocalMonitoring(monEv) && (isProd || isStaging)) {
    mon.status = 'NOT_VERIFIED';
    mon.reason = 'PROCESS_LOCAL telemetry is not distributed production monitoring';
    mon.notes = mon.reason;
    mon.verified = false;
  }

  const passedGates = gates.filter((g) => g.status === 'PASS').map((g) => g.name);
  const failedGates = gates.filter((g) => g.status === 'FAIL').map((g) => g.name);
  const notVerifiedGates = gates.filter((g) => g.status === 'NOT_VERIFIED').map((g) => g.name);
  const blockedGates = gates.filter((g) => g.status === 'BLOCKED').map((g) => g.name);

  const mandatory = gates.filter((g) => MANDATORY_PRODUCTION_GATES.includes(g.name));
  const mandatoryBlockers = [];
  for (const g of mandatory) {
    if (g.status === 'FAIL' || g.status === 'NOT_VERIFIED' || g.status === 'BLOCKED') {
      mandatoryBlockers.push(`${g.name}:${g.status}`);
    }
  }

  // Production-only hard rules from production evidence (not local readiness bleed)
  const tfEv = evidenceBundle['test-funding'];
  if (isProd && tfEv && validateEvidenceForClaim(tfEv, 'production').valid) {
    if (tfEv.checks?.goLiveBlocked || tfEv.gates?.TEST_FUNDING?.status === 'FAIL' || tfEv.checks?.allResidualsZero === false) {
      mandatoryBlockers.push('TEST_FUNDING:FAIL:residual');
    }
  } else if (!isProd && !isStaging && readiness.testFunding?.goLiveBlocked) {
    mandatoryBlockers.push('TEST_FUNDING:FAIL:residual');
  }

  const ledEv = evidenceBundle.ledger;
  if (isProd && ledEv && validateEvidenceForClaim(ledEv, 'production').valid) {
    const actionable = ledEv.checks?.ACTIONABLE_MISMATCH_COUNT ?? ledEv.checks?.ACTIONABLE ?? ledEv.checks?.actionableMismatchCount;
    if (actionable != null && Number(actionable) > 0) {
      mandatoryBlockers.push(`LEDGER:FAIL:actionable:${actionable}`);
    }
  } else if (!isProd && !isStaging) {
    const actionable = readiness.mismatchCounts?.ACTIONABLE_MISMATCH_COUNT;
    if (actionable != null && actionable > 0) {
      mandatoryBlockers.push(`LEDGER:FAIL:actionable:${actionable}`);
    }
  }

  const allMandatoryPass = mandatory.every((g) => g.status === 'PASS')
    && !mandatoryBlockers.some((b) => b.includes(':FAIL'));

  const productionClaimAllowed = isProd && allMandatoryPass && mandatoryBlockers.length === 0;
  const stagingClaimAllowed = isStaging && allMandatoryPass && mandatoryBlockers.length === 0;

  let certificationStatus = 'NOT_VERIFIED';
  if (failedGates.length || mandatoryBlockers.some((b) => b.includes(':FAIL'))) certificationStatus = 'RED';
  else if ((isProd || isStaging) && mandatoryBlockers.length) certificationStatus = 'NO-GO';
  else if (blockedGates.length || notVerifiedGates.length) {
    certificationStatus = isProd || isStaging ? 'NO-GO' : 'YELLOW';
  } else if (allMandatoryPass && (isProd || isStaging)) certificationStatus = 'GREEN';
  else if (allMandatoryPass) certificationStatus = 'YELLOW';

  if ((isProd || isStaging) && (!productionClaimAllowed && !stagingClaimAllowed)) {
    if (certificationStatus === 'GREEN') certificationStatus = 'NO-GO';
  }
  if ((isProd || isStaging) && mandatoryBlockers.length && certificationStatus !== 'RED') {
    certificationStatus = 'NO-GO';
  }
  if (isProd && !productionClaimAllowed && certificationStatus === 'RED') {
    certificationStatus = 'NO-GO';
  }

  const goNoGo = {
    decision: (isProd || isStaging)
      ? (productionClaimAllowed || stagingClaimAllowed ? 'GO' : 'NO-GO')
      : (mandatoryBlockers.some((b) => b.includes('FAIL')) ? 'HOLD' : 'GO (local only — not production)'),
    productionClaimAllowed: Boolean(productionClaimAllowed),
    stagingClaimAllowed: Boolean(stagingClaimAllowed),
    mandatoryBlockers: [...new Set(mandatoryBlockers)],
    forceGreenAllowed: false,
    rule: 'Production GREEN only when every mandatory gate is PASS with environment-matched Phase 11 evidence (valid, fresh, non-stub). Local/staging evidence never satisfies production. Dump ≠ PITR. PROCESS_LOCAL ≠ distributed monitoring. identityProven required for DATABASE. No force-GREEN. No auto-repair. No operator/UI/CLI override.',
    autoRepair: false,
  };

  const checklistSections = buildGoLiveChecklist(gates, byName);

  const evidenceCompleteness = {
    phase11Files: listPhase11EvidenceFiles().length,
    phase10Files: listPhase10EvidenceFiles().length,
    phase9Files: listPhase9EvidenceFiles().length,
    phase8Files: listPhase8EvidenceFiles().length,
    filesOnDisk: evidenceFiles.length,
    latestBundlesPresent: Object.keys(evidenceBundle).length,
    note: 'Presence ≠ PASS; gate needs result PASS, matching environment, non-stale, non-stub evidence. Phase 11 overrides older phases when present.',
    missingLatest: Object.keys(EVIDENCE_GATE_MAP)
      .map((k) => EVIDENCE_GATE_MAP[k])
      .filter((v, i, a) => a.indexOf(v) === i)
      .filter((n) => !evidenceBundle[n]),
  };

  const gatesMap = Object.fromEntries(gates.map((g) => [g.name, g]));

  return {
    success: true,
    phase: 11,
    certificationVersion: 'phase11',
    environment: envLabel,
    isProductionClaim: isProd,
    isStagingClaim: isStaging,
    certificationStatus,
    PRODUCTION_CERTIFICATION_STATUS: certificationStatus,
    status: certificationStatus,
    goNoGo,
    productionClaimAllowed: goNoGo.productionClaimAllowed,
    forceGreenAllowed: false,
    autoRepair: false,
    overrideAllowed: false,
    forceGreen: false,
    gates,
    gatesMap,
    passedGates,
    failedGates,
    notVerifiedGates,
    blockedGates,
    mandatoryProductionGates: [...MANDATORY_PRODUCTION_GATES],
    summary: {
      decision: goNoGo.decision,
      productionClaimAllowed: goNoGo.productionClaimAllowed,
      mandatoryBlockerCount: goNoGo.mandatoryBlockers.length,
      passed: passedGates.length,
      failed: failedGates.length,
      notVerified: notVerifiedGates.length,
      blocked: blockedGates.length,
    },
    checklist: checklistSections,
    evidenceCompleteness,
    evidenceBundleKeys: Object.keys(evidenceBundle),
    evidence: {
      phase11Dir: 'docs/evidence/phase11',
      phase10Dir: 'docs/evidence/phase10',
      phase9Dir: 'docs/evidence/phase9',
      phase8Dir: 'docs/evidence/phase8',
      files: evidenceFiles.slice(0, 120),
    },
    testFunding: readiness.testFunding || null,
    ledger: {
      mismatchCounts: readiness.mismatchCounts || null,
      policy: 'FLAG_ONLY_NO_AUTO_REPAIR',
      note: isProd
        ? 'Production ledger PASS requires phase10 ledger evidence with environment=production and actionableMismatchCount===0'
        : 'Connected DB investigate counts',
    },
    reconciliation: {
      status: byName.get('RECONCILIATION')?.status || 'NOT_VERIFIED',
      policy: 'FLAG_ONLY',
    },
    security: {
      MFA: byName.get('MFA')?.status,
      RBAC: byName.get('RBAC')?.status,
      CSRF: byName.get('CSRF')?.status,
      AUTHENTICATION: byName.get('AUTHENTICATION')?.status,
    },
    dr: { status: byName.get('DR')?.status || 'NOT_VERIFIED' },
    pitr: { status: byName.get('PITR')?.status || 'NOT_VERIFIED' },
    rpo: { status: byName.get('RPO')?.status || 'NOT_VERIFIED' },
    rto: { status: byName.get('RTO')?.status || 'NOT_VERIFIED' },
    deployment: { status: byName.get('DEPLOYMENT')?.status || 'NOT_VERIFIED' },
    smoke: { status: byName.get('PRODUCTION_SMOKE')?.status || 'NOT_VERIFIED' },
    build: { gitCommit: gitCommitSafe() },
    mismatchCounts: readiness.mismatchCounts || null,
    whyNotGreen: readiness.whyNotGreen || [],
    readinessOverall: readiness.overall,
    gitCommit: gitCommitSafe(),
    generatedAt: new Date().toISOString(),
    evidenceRule: 'PASS requires phase11 (preferred) / phase10 / phase9 / phase8 evidence with matching environment, valid timestamp, non-stale age, non-stub. Local never certifies production. Dump ≠ PITR. identityProven required for DATABASE. No auto-repair. No force-GREEN. No override.',
  };
}

function buildGoLiveChecklist(gates, byName) {
  const pick = (ids) => ids.map((id) => {
    const g = byName.get(id) || gates.find((x) => x.name === id);
    return {
      gate: id,
      status: g?.status || 'NOT_VERIFIED',
      reason: g?.reason || g?.notes || null,
      evidenceTimestamp: g?.evidenceTimestamp || null,
    };
  });
  return {
    note: 'Read-only operator checklist. Completing checklist items does NOT override certification.',
    canOverrideCertification: false,
    sections: {
      FINANCE: pick(['FINANCE', 'LEDGER', 'RECONCILIATION', 'TEST_FUNDING']),
      SECURITY: pick(['SECURITY', 'AUTHENTICATION', 'MFA', 'RBAC', 'CSRF', 'AUDIT_LOGGING', 'SECRETS']),
      DATABASE: pick(['DATABASE', 'MIGRATIONS']),
      DEPLOYMENT: pick(['DEPLOYMENT', 'BUILD', 'CONFIGURATION', 'PRODUCTION_SMOKE']),
      DR: pick(['BACKUP', 'DR', 'PITR', 'RPO', 'RTO']),
      MONITORING: pick(['MONITORING']),
      APPLICATION: pick(['CORE', 'TESTS', 'PROMOTIONS', 'CRM']),
      OPERATIONS: pick(['WORKERS', 'OUTBOX', 'REDIS', 'WEBSOCKET']),
    },
  };
}

export {
  EVIDENCE_GATE_MAP,
  mapReadinessToCertStatus,
  evidenceMatchesClaim,
  DB_BOUND_GATES,
  isDumpOnlyDrEvidence,
  isProcessLocalMonitoring,
  isStubEvidence,
};
export { validateEvidenceForClaim } from './certificationEvidence.mjs';
