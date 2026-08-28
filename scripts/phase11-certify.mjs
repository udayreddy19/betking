#!/usr/bin/env node
/**
 * Phase 11 certify — resolve blockers with REAL evidence only.
 * Emits honest NOT_VERIFIED / BLOCKED / FAIL under docs/evidence/phase11/.
 * Never fabricates PASS. Never force-GREEN. Never auto-repairs wallets/ledger.
 *
 * Usage:
 *   npm run phase11:certify -- --environment=production
 *   npm run phase11:certify -- --environment=production --i-understand-production=1
 */
import dotenv from 'dotenv';
dotenv.config();

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildProductionCertification } from '../lib/productionCertificationEngine.mjs';
import {
  ensurePhase11EvidenceDir,
  writePhase11Evidence,
  PHASE11_EVIDENCE_DIR,
  gitCommitSafe,
  redactDatabaseIdentity,
} from '../lib/certificationEvidence.mjs';
import { inspectKnownTestFundingAccounts } from '../lib/knownTestFundingExclusions.mjs';
import { checkMigrationsOnDiskAndDb, REQUIRED_MIGRATIONS } from '../lib/productionReadinessEngine.mjs';

function arg(name, fallback = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const environment = String(arg('environment', process.env.CERT_ENV || 'production')).toLowerCase();
const claimProd = environment === 'production';
const prodSmokeAck = arg('i-understand-production') === '1' || process.env.PRODUCTION_SMOKE_ALLOW === '1';
const baseUrl = String(arg('base-url', process.env.SMOKE_BASE_URL || 'https://oddsyra.com')).replace(/\/$/, '');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
ensurePhase11EvidenceDir();

function gateNameFromSlug(slug) {
  return String(slug).toUpperCase().replace(/-/g, '_');
}

function emit(name, payload) {
  return writePhase11Evidence(name, payload);
}

function emitNotVerified(name, notes, extra = {}) {
  const g = gateNameFromSlug(name);
  return emit(name, {
    environment: claimProd ? 'production' : environment,
    result: 'NOT_VERIFIED',
    stub: extra.stub !== false,
    verificationMethod: extra.verificationMethod || 'phase11_stub',
    notes: notes || 'Not independently verified for production claim in this session',
    gates: { [g]: { status: 'NOT_VERIFIED', notes } },
    checks: extra.checks || {},
    identityProven: false,
    ...extra,
  });
}

// Preserve prior go-live emit (phase9 paths) for continuity
spawnSync(process.execPath, ['scripts/production-go-live-check.mjs', `--environment=${environment}`], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});

// --- DATABASE / MIGRATIONS (connected URL is NEVER assumed production) ---
const migrationCheck = await checkMigrationsOnDiskAndDb().catch((e) => ({
  status: 'RED',
  error: e.message,
  appliedCount: null,
  actualHead: null,
  missingMigrations: [...REQUIRED_MIGRATIONS],
  appliedStatus: {},
}));

let dbReachable = false;
try {
  const { query } = await import('../db/pg.js');
  await query('SELECT 1 AS ok');
  dbReachable = true;
} catch {
  dbReachable = false;
}

const redactedId = redactDatabaseIdentity(process.env.DATABASE_URL);
const prodIdentityAsserted = process.env.PRODUCTION_DB_ASSERTED === '1'
  && process.env.PRODUCTION_DB_ASSERTION_REF;

emit('database', {
  environment: claimProd ? 'production' : environment,
  result: claimProd ? 'NOT_VERIFIED' : (dbReachable ? 'NOT_VERIFIED' : 'FAIL'),
  stub: false,
  verificationMethod: 'connected_url_probe',
  identityProven: Boolean(prodIdentityAsserted),
  notes: claimProd
    ? (prodIdentityAsserted
      ? 'Operator asserted production DB via PRODUCTION_DB_ASSERTED=1 — still requires full schema PASS evidence'
      : 'Connected DATABASE_URL is NOT proven production. Set PRODUCTION_DB_ASSERTED=1 + PRODUCTION_DB_ASSERTION_REF under change control after verifying host/db.')
    : 'Non-production claim',
  gates: {
    DATABASE: {
      status: claimProd
        ? (prodIdentityAsserted && dbReachable ? 'NOT_VERIFIED' : 'NOT_VERIFIED')
        : 'NOT_VERIFIED',
    },
  },
  checks: {
    dbReachable,
    identityProven: Boolean(prodIdentityAsserted),
    assertionRef: prodIdentityAsserted ? String(process.env.PRODUCTION_DB_ASSERTION_REF).slice(0, 120) : null,
    databaseIdentity: redactedId,
    migrationHead: migrationCheck.actualHead || null,
    requiredMigrations: REQUIRED_MIGRATIONS,
    appliedStatus: migrationCheck.appliedStatus || {},
    missingMigrations: migrationCheck.missingMigrations || [],
  },
  errors: dbReachable ? [] : ['DATABASE_UNREACHABLE'],
});

emit('migrations', {
  environment: claimProd ? 'production' : environment,
  result: 'NOT_VERIFIED',
  stub: false,
  verificationMethod: 'connected_url_probe',
  notes: claimProd
    ? 'Migration PASS requires proven production DB identity + applied 067–071 and 098'
    : 'Non-production migration probe',
  gates: { MIGRATIONS: { status: 'NOT_VERIFIED' } },
  checks: {
    requiredMigrations: REQUIRED_MIGRATIONS,
    expectedVersions: REQUIRED_MIGRATIONS,
    actualHead: migrationCheck.actualHead || null,
    appliedStatus: migrationCheck.appliedStatus || {},
    missingMigrations: migrationCheck.missingMigrations || [],
    identityProven: Boolean(prodIdentityAsserted),
  },
});

// --- TEST FUNDING ---
const tf = await inspectKnownTestFundingAccounts().catch((e) => ({
  success: false,
  error: e.message,
  goLiveBlocked: true,
  code: 'TEST_FUNDING_INSPECT_FAILED',
  accounts: [],
  residualTotal: null,
  pendingCount: null,
}));

const tfResult = claimProd
  ? 'NOT_VERIFIED'
  : (tf.goLiveBlocked ? 'FAIL' : (tf.code === 'TEST_FUNDING_CLEAN' ? 'PASS' : 'NOT_VERIFIED'));

emit('test-funding', {
  environment: claimProd ? 'production' : environment,
  result: tfResult,
  stub: false,
  verificationMethod: 'inspectKnownTestFundingAccounts',
  notes: claimProd
    ? 'Connected-DB inspect is not production evidence unless identityProven + environment=production assertion'
    : 'Local/connected inspect',
  gates: {
    TEST_FUNDING: {
      status: tfResult,
      notes: tf.code || null,
    },
  },
  checks: {
    code: tf.code || null,
    goLiveBlocked: Boolean(tf.goLiveBlocked),
    allResidualsZero: claimProd ? null : (tf.pendingCount === 0 && !tf.goLiveBlocked),
    totalKnownTestFundingAccounts: Array.isArray(tf.accounts) ? tf.accounts.length : null,
    accountsWithResidualBalance: tf.pendingCount ?? null,
    totalResidualBalance: tf.residualTotal ?? null,
    safeAccountIds: (tf.accounts || []).slice(0, 20).map((a) => a.userId || a.id).filter(Boolean),
    AUTO_REPAIR: false,
    identityProven: Boolean(prodIdentityAsserted),
  },
});

// --- LEDGER ---
emit('ledger', {
  environment: claimProd ? 'production' : environment,
  result: 'NOT_VERIFIED',
  stub: false,
  verificationMethod: 'investigate_required',
  notes: 'Run finance:investigate against proven production DB; AUTO_REPAIR=false',
  gates: { LEDGER: { status: 'NOT_VERIFIED' }, FINANCE: { status: 'NOT_VERIFIED' } },
  checks: {
    actionableMismatchCount: null,
    rawMismatchCount: null,
    excludedKnownTestFundingCount: null,
    AUTO_REPAIR: false,
    identityProven: Boolean(prodIdentityAsserted),
  },
});

emit('reconciliation', {
  environment: claimProd ? 'production' : environment,
  result: 'NOT_VERIFIED',
  stub: false,
  verificationMethod: 'flag_only_engine',
  notes: 'FLAG_ONLY reconciliation; production verification requires proven prod DB + investigation metadata sample',
  gates: { RECONCILIATION: { status: 'NOT_VERIFIED' } },
  checks: {
    policy: 'FLAG_ONLY',
    autoRepair: false,
    makerCheckerRequiredForAdjustment: true,
  },
});

// --- SECURITY family ---
const securityNotes = 'Credentialed production security matrix not executed in this agent session';
for (const name of ['security', 'mfa', 'rbac', 'csrf', 'authentication', 'audit-logging']) {
  emitNotVerified(name, securityNotes, {
    stub: false,
    verificationMethod: 'credentialed_matrix_required',
    checks: { credentialed: false, secretsPrinted: false },
  });
}

// --- INFRA ---
for (const name of ['workers', 'outbox', 'redis', 'websocket']) {
  emitNotVerified(name, 'Independent production verification required (readiness alone is insufficient)', {
    stub: true,
    verificationMethod: 'phase11_stub',
  });
}

// --- DR / PITR ---
for (const name of ['dr', 'pitr', 'rpo', 'rto', 'backup']) {
  emitNotVerified(name, 'PRODUCTION_CLASS_PITR drill not executed; SQL dump cannot satisfy PITR/RPO/RTO', {
    stub: false,
    verificationMethod: 'pitr_drill_required',
    dumpOnly: false,
    restore_environment: null,
    checks: {
      restore_start: null,
      restore_finish: null,
      RTO: 'NOT_VERIFIED',
      RPO: 'NOT_VERIFIED',
      wal_position: null,
    },
  });
}

emit('monitoring', {
  environment: claimProd ? 'production' : environment,
  result: 'NOT_VERIFIED',
  stub: false,
  verificationMethod: 'distributed_required',
  metricsBackend: 'PROCESS_LOCAL',
  processLocal: true,
  notes: 'PROCESS_LOCAL telemetry is not distributed production monitoring',
  gates: { MONITORING: { status: 'NOT_VERIFIED' } },
  checks: {
    metricsBackend: 'PROCESS_LOCAL',
    alertBackend: 'NOT_VERIFIED',
    logBackend: 'NOT_VERIFIED',
  },
});

emit('deployment', {
  environment: claimProd ? 'production' : environment,
  result: 'NOT_VERIFIED',
  stub: false,
  verificationMethod: 'deployment_evidence_required',
  notes: 'Local git commit ≠ proven production deployment',
  gates: { DEPLOYMENT: { status: 'NOT_VERIFIED' } },
  checks: {
    localGitCommit: gitCommitSafe(),
    productionCommit: null,
    artifactId: null,
    rollbackCapability: 'application_image_only',
  },
});

emit('secrets', {
  environment: claimProd ? 'production' : environment,
  result: 'NOT_VERIFIED',
  stub: false,
  verificationMethod: 'config_presence_probe',
  notes: 'Presence of local env vars is not production secrets certification',
  gates: { SECRETS: { status: 'NOT_VERIFIED' } },
  checks: {
    JWT_SECRET: process.env.JWT_SECRET ? 'present' : 'missing',
    DATABASE_URL: process.env.DATABASE_URL ? 'present' : 'missing',
    REDIS_URL: (process.env.REDIS_URL || process.env.REDIS_HOST) ? 'present' : 'missing',
    secretsPrinted: false,
  },
});

emit('configuration', {
  environment: claimProd ? 'production' : environment,
  result: 'NOT_VERIFIED',
  stub: false,
  verificationMethod: 'config_presence_probe',
  notes: 'Production configuration must be verified on the production host',
  gates: { CONFIGURATION: { status: 'NOT_VERIFIED' } },
  checks: {
    NODE_ENV: process.env.NODE_ENV || null,
    claimedEnvironment: environment,
  },
});

for (const name of ['promotions', 'crm']) {
  emitNotVerified(name, 'Production feature verification not executed in this session', {
    stub: false,
    verificationMethod: 'feature_probe_required',
  });
}

// --- PRODUCTION SMOKE ---
if (claimProd && !prodSmokeAck) {
  emit('production-smoke', {
    environment: 'production',
    result: 'BLOCKED',
    blocked: true,
    blockReason: 'Pass --i-understand-production=1 for authorized production smoke',
    stub: false,
    verificationMethod: 'ack_required',
    gates: { PRODUCTION_SMOKE: { status: 'BLOCKED' }, CORE: { status: 'BLOCKED' } },
  });
} else {
  const smokeArgs = [
    'scripts/production-smoke.mjs',
    `--environment=${environment}`,
    `--base-url=${baseUrl}`,
  ];
  if (prodSmokeAck) smokeArgs.push('--i-understand-production=1');
  const smoke = spawnSync(process.execPath, smokeArgs, {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
  });
  let smokeResult = 'NOT_VERIFIED';
  let blocked = false;
  let blockReason = null;
  try {
    const parsed = JSON.parse(smoke.stdout?.split('\n').filter(Boolean).slice(-1)[0] || '{}');
    smokeResult = parsed.result || smokeResult;
    blocked = Boolean(parsed.blocked);
    blockReason = parsed.blockReason || null;
  } catch {
    if (smoke.status !== 0) {
      smokeResult = 'NOT_VERIFIED';
      blockReason = 'smoke_parse_failed_or_network';
    }
  }
  // Detect CONNECT / tunnel blocks
  const combined = `${smoke.stdout || ''}\n${smoke.stderr || ''}`;
  if (/CONNECT|403|ECONNREFUSED|ENOTFOUND|tunnel/i.test(combined) && smokeResult === 'PASS') {
    smokeResult = 'BLOCKED';
    blocked = true;
    blockReason = 'external_probe_blocked';
  }
  emit('production-smoke', {
    environment: claimProd ? 'production' : environment,
    result: blocked ? 'BLOCKED' : smokeResult,
    blocked,
    blockReason,
    stub: false,
    verificationMethod: 'production_smoke_script',
    gates: {
      PRODUCTION_SMOKE: { status: blocked ? 'BLOCKED' : smokeResult },
      CORE: { status: blocked ? 'BLOCKED' : (smokeResult === 'PASS' ? 'PASS' : smokeResult) },
    },
    checks: {
      baseUrl,
      exitCode: smoke.status,
      secretsPrinted: false,
      financialSmoke: false,
    },
  });
}

const cert = await buildProductionCertification({ environment });

const remainingBlockers = [...(cert.goNoGo?.mandatoryBlockers || [])];
const summary = {
  phase: 11,
  environment,
  timestamp: new Date().toISOString(),
  gitCommit: cert.gitCommit || gitCommitSafe(),
  result: cert.PRODUCTION_CERTIFICATION_STATUS,
  PRODUCTION_CERTIFICATION_STATUS: cert.PRODUCTION_CERTIFICATION_STATUS,
  productionClaimAllowed: cert.productionClaimAllowed,
  forceGreenAllowed: false,
  autoRepair: false,
  overrideAllowed: false,
  goNoGo: cert.goNoGo,
  summary: cert.summary,
  passedGates: cert.passedGates,
  failedGates: cert.failedGates,
  notVerifiedGates: cert.notVerifiedGates,
  blockedGates: cert.blockedGates,
  mandatoryBlockers: remainingBlockers,
  remainingBlockers,
  evidenceCompleteness: cert.evidenceCompleteness,
  checklist: cert.checklist,
  security: cert.security,
  ledger: cert.ledger,
  testFunding: {
    code: tf.code,
    goLiveBlocked: tf.goLiveBlocked,
    note: 'Connected-DB inspect is not production unless identityProven',
  },
  dr: cert.dr,
  pitr: cert.pitr,
  rpo: cert.rpo,
  rto: cert.rto,
  deployment: cert.deployment,
  smoke: cert.smoke,
  operatorActionsForGreen: [
    'Assert production DB under change control (PRODUCTION_DB_ASSERTED=1 + ref) and emit database/migrations PASS evidence',
    'Run finance:investigate on production; ensure actionableMismatchCount===0; emit ledger evidence',
    'Inspect test funding on production; zero residuals via maker/checker only; emit test-funding PASS',
    'Execute credentialed security matrix (auth/MFA/RBAC/CSRF/audit) on production; emit security family PASS',
    'Independently verify workers/outbox/redis/websocket on production; emit non-stub PASS',
    'Execute PRODUCTION_CLASS_PITR drill with real RPO/RTO; emit pitr/rpo/rto/dr PASS',
    'Prove distributed monitoring (not PROCESS_LOCAL); emit monitoring PASS',
    'Capture production deployment SHA/artifact/health; emit deployment PASS',
    'Run production:smoke with --i-understand-production=1 from an authorized network; emit PASS',
    'Re-run npm run phase11:certify -- --environment=production until productionClaimAllowed=true',
  ],
  secretsPrinted: false,
};

emit('certification', summary);
fs.writeFileSync(path.join(PHASE11_EVIDENCE_DIR, 'VERIFICATION_SUMMARY.json'), JSON.stringify(summary, null, 2));
fs.writeFileSync(
  path.join(PHASE11_EVIDENCE_DIR, 'FINAL_STATUS.txt'),
  [
    `PRODUCTION_CERTIFICATION_STATUS=${summary.PRODUCTION_CERTIFICATION_STATUS}`,
    `GO_NO_GO=${summary.goNoGo.decision}`,
    `productionClaimAllowed=${summary.productionClaimAllowed}`,
    `forceGreenAllowed=false`,
    `autoRepair=false`,
    `overrideAllowed=false`,
    `mandatoryBlockers=${remainingBlockers.length}`,
    `certificationVersion=phase11`,
    `generatedAt=${summary.timestamp}`,
    '',
    'REMAINING_BLOCKERS:',
    ...remainingBlockers.map((b) => `  - ${b}`),
    '',
  ].join('\n'),
);

console.log(JSON.stringify({
  event: 'PHASE11_CERTIFY',
  PRODUCTION_CERTIFICATION_STATUS: summary.PRODUCTION_CERTIFICATION_STATUS,
  productionClaimAllowed: summary.productionClaimAllowed,
  forceGreenAllowed: false,
  autoRepair: false,
  goNoGo: summary.goNoGo.decision,
  mandatoryBlockers: remainingBlockers.slice(0, 30),
  summaryPath: 'docs/evidence/phase11/VERIFICATION_SUMMARY.json',
}, null, 2));

process.exit(summary.productionClaimAllowed ? 0 : 2);
