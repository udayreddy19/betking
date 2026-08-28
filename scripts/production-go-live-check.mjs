#!/usr/bin/env node
/**
 * Phase 9 production go-live check — emits honest NOT_VERIFIED/BLOCKED evidence
 * when production access is unavailable. Never fabricates PASS. Never mutates money.
 *
 * Usage:
 *   CERT_ENV=production npm run production:go-live-check
 *   npm run production:go-live-check -- --environment=production --base-url=https://oddsyra.com
 */
import dotenv from 'dotenv';
dotenv.config();

import { writePhase9Evidence, gitCommitSafe } from '../lib/certificationEvidence.mjs';
import { inspectKnownTestFundingAccounts } from '../lib/knownTestFundingExclusions.mjs';
import { checkMigrationsOnDiskAndDb, REQUIRED_MIGRATIONS } from '../lib/productionReadinessEngine.mjs';

function arg(name, fallback = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const environment = String(arg('environment', process.env.CERT_ENV || 'production')).toLowerCase();
const baseUrl = String(arg('base-url', process.env.SMOKE_BASE_URL || 'https://oddsyra.com')).replace(/\/$/, '');
const claimProd = environment === 'production';

async function probe(path) {
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'OddsYraPhase9GoLive/1.0' },
      redirect: 'manual',
    });
    const ct = res.headers.get('content-type') || '';
    const text = await res.text();
    return {
      path,
      status: res.status,
      isJson: ct.includes('application/json'),
      bodySnippet: text.slice(0, 160),
    };
  } catch (err) {
    return { path, status: null, error: String(err.message || err).slice(0, 200), blocked: true };
  }
}

// --- Database / migrations (connected URL — NEVER claim as production unless CERT_ENV matches intentional prod URL) ---
const migrationCheck = await checkMigrationsOnDiskAndDb();
let dbReachable = migrationCheck.appliedCount != null;
try {
  const { query } = await import('../db/pg.js');
  await query('SELECT 1 AS ok');
  dbReachable = true;
} catch {
  dbReachable = false;
}

const dbResult = claimProd
  ? 'NOT_VERIFIED'
  : (dbReachable ? (migrationCheck.status === 'GREEN' ? 'PASS' : 'NOT_VERIFIED') : 'FAIL');

writePhase9Evidence('database', {
  environment: claimProd ? 'local-connected-not-production' : environment,
  claimedEnvironment: environment,
  result: dbResult,
  gates: {
    DATABASE: { status: claimProd ? 'NOT_VERIFIED' : dbResult },
  },
  checks: {
    dbReachable,
    migrationHead: migrationCheck.actualHead,
    requiredMigrations: REQUIRED_MIGRATIONS,
    appliedStatus: migrationCheck.appliedStatus,
    missingMigrations: migrationCheck.missingMigrations,
    note: claimProd
      ? 'Connected DATABASE_URL is NOT asserted as production. Operator must run with production credentials under change control.'
      : 'Non-production check',
  },
  errors: dbReachable ? [] : ['DATABASE_UNREACHABLE'],
});

writePhase9Evidence('migrations', {
  environment: claimProd ? 'local-connected-not-production' : environment,
  claimedEnvironment: environment,
  result: claimProd ? 'NOT_VERIFIED' : (migrationCheck.missingMigrations?.length ? 'FAIL' : 'NOT_VERIFIED'),
  gates: { MIGRATIONS: { status: claimProd ? 'NOT_VERIFIED' : 'NOT_VERIFIED' } },
  checks: {
    requiredMigrations: REQUIRED_MIGRATIONS,
    migrationHead: migrationCheck.actualHead,
    missingMigrations: migrationCheck.missingMigrations,
    schemaChecks: migrationCheck.appliedStatus,
  },
});

// --- Test funding ---
const tf = await inspectKnownTestFundingAccounts().catch((e) => ({
  success: false,
  error: e.message,
  goLiveBlocked: true,
  code: 'TEST_FUNDING_INSPECT_FAILED',
  accounts: [],
}));

writePhase9Evidence('test-funding', {
  environment: claimProd ? 'local-connected-not-production' : environment,
  claimedEnvironment: environment,
  result: claimProd ? 'NOT_VERIFIED' : (tf.goLiveBlocked ? 'FAIL' : (tf.code === 'TEST_FUNDING_CLEAN' ? 'PASS' : 'NOT_VERIFIED')),
  gates: {
    TEST_FUNDING: {
      status: claimProd ? 'NOT_VERIFIED' : (tf.goLiveBlocked ? 'FAIL' : 'PASS'),
      notes: claimProd ? 'Production DB not confirmed' : tf.code,
    },
  },
  checks: {
    code: tf.code,
    goLiveBlocked: tf.goLiveBlocked,
    pendingCount: tf.pendingCount,
    residualTotal: tf.residualTotal,
    accounts: (tf.accounts || []).map((a) => ({
      userId: a.userId,
      cashBalance: a.cashBalance,
      bonusBalance: a.bonusBalance,
      freebetBalance: a.freebetBalance,
      reservedBalance: a.reservedBalance,
      bucketTotal: a.bucketTotal,
      cleanupStatus: a.cleanupStatus,
      residualNonZero: a.residualNonZero,
    })),
  },
  autoRepair: false,
});

// --- Public probes ---
const readiness = await probe('/readiness');
const liveness = await probe('/liveness');
const healthLive = await probe('/health/live');
const healthReady = await probe('/health/ready');
const healthDeps = await probe('/health/dependencies');
const adminUnauth = await probe('/api/admin/operations/production-certification');

const probeBlocked = Boolean(readiness.blocked || readiness.error);
const smokeStatus = probeBlocked
  ? 'BLOCKED'
  : (
    readiness.status === 200 && readiness.isJson && [401, 403].includes(adminUnauth.status)
      ? 'NOT_VERIFIED'
      : 'FAIL'
  );

writePhase9Evidence('production-smoke', {
  environment: claimProd ? 'production' : environment,
  result: smokeStatus,
  blocked: probeBlocked,
  blockReason: probeBlocked ? (readiness.error || 'probe failed') : undefined,
  gates: {
    PRODUCTION_SMOKE: {
      status: smokeStatus,
      notes: probeBlocked
        ? 'Public probe blocked from this environment'
        : 'Public/unauth probes only — credentialed matrix still NOT_VERIFIED',
    },
    CORE: {
      status: readiness.status === 200 && readiness.isJson ? 'NOT_VERIFIED' : (probeBlocked ? 'BLOCKED' : 'FAIL'),
      notes: 'Public readiness alone does not certify CORE for productionClaimAllowed',
    },
  },
  checks: { readiness, liveness, healthLive, healthReady, healthDeps, adminUnauth },
  baseUrl,
  gitCommit: gitCommitSafe(),
});

// Stubs that remain NOT_VERIFIED without operator access
const stubs = [
  ['security', 'SECURITY', 'Credentialed MFA/RBAC/CSRF matrix required'],
  ['authentication', 'AUTHENTICATION', 'Credentialed auth matrix required'],
  ['mfa', 'MFA', 'Live MFA challenge required'],
  ['rbac', 'RBAC', 'Role deny/allow matrix required'],
  ['csrf', 'CSRF', 'Cookie CSRF matrix required'],
  ['ledger', 'LEDGER', 'Production finance:investigate required'],
  ['reconciliation', 'RECONCILIATION', 'Production recon audit required'],
  ['workers', 'WORKERS', 'Independent worker verification required'],
  ['outbox', 'OUTBOX', 'Independent outbox verification required'],
  ['redis', 'REDIS', 'Independent Redis verification required'],
  ['websocket', 'WEBSOCKET', 'Independent WebSocket verification required'],
  ['backup', 'BACKUP', 'Backup + restore evidence required'],
  ['dr', 'DR', 'DR class evidence required'],
  ['pitr', 'PITR', 'Production-class PITR required'],
  ['rpo', 'RPO', 'Measured RPO required'],
  ['rto', 'RTO', 'Measured RTO required'],
  ['monitoring', 'MONITORING', 'Distributed monitoring verification required'],
  ['deployment', 'DEPLOYMENT', 'Deployment version + smoke evidence required'],
  ['secrets', 'SECRETS', 'Production secret presence verification required'],
  ['configuration', 'CONFIGURATION', 'Production config verification required'],
  ['promotions', 'PROMOTIONS', 'Production promo smoke required'],
  ['crm', 'CRM', 'Production CRM dry-run smoke required'],
  ['audit-logging', 'AUDIT_LOGGING', 'Privileged action audit inspect required'],
];

for (const [name, gate, note] of stubs) {
  writePhase9Evidence(name, {
    environment: claimProd ? 'production' : environment,
    result: 'NOT_VERIFIED',
    gates: { [gate]: { status: 'NOT_VERIFIED', notes: note } },
    checks: { note },
    autoRepair: false,
  });
}

console.log(JSON.stringify({
  event: 'PHASE9_GO_LIVE_CHECK',
  environment,
  claimedProduction: claimProd,
  productionDbAsserted: false,
  smokeStatus,
  probeBlocked,
  testFundingOnConnectedDb: tf.code,
  autoRepair: false,
  secretsPrinted: false,
}, null, 2));
process.exit(0);
