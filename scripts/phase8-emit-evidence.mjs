#!/usr/bin/env node
/**
 * Emit Phase 8 evidence stubs for areas that cannot PASS without prod access.
 * Honest NOT_VERIFIED / BLOCKED — never fabricates PASS for production.
 */
import dotenv from 'dotenv';
dotenv.config();

import { writePhase8Evidence } from '../lib/certificationEvidence.mjs';
import { inspectKnownTestFundingAccounts } from '../lib/knownTestFundingExclusions.mjs';

const environment = String(process.env.CERT_ENV || 'local').toLowerCase();

const tf = await inspectKnownTestFundingAccounts().catch((e) => ({
  success: false,
  error: e.message,
  goLiveBlocked: true,
  code: 'TEST_FUNDING_INSPECT_FAILED',
  accounts: [],
}));

const tfStatus = environment === 'production'
  ? 'NOT_VERIFIED'
  : (tf.goLiveBlocked ? 'FAIL' : (tf.code === 'TEST_FUNDING_CLEAN' ? 'PASS' : 'NOT_VERIFIED'));

writePhase8Evidence('test-funding', {
  environment,
  result: tfStatus,
  gates: { TEST_FUNDING: { status: environment === 'production' ? 'NOT_VERIFIED' : tfStatus } },
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
  note: environment === 'production'
    ? 'Connected DB is not assumed to be production — re-run with production DATABASE_URL + CERT_ENV=production under change control'
    : 'Local/dev inspection only',
  autoRepair: false,
});

// Workers / outbox / redis / websocket — not claimable from generic health alone
for (const [name, gate] of [
  ['workers', 'WORKERS'],
  ['outbox', 'OUTBOX'],
  ['redis', 'REDIS'],
  ['websocket', 'WEBSOCKET'],
  ['monitoring', 'MONITORING'],
]) {
  writePhase8Evidence(name, {
    environment,
    result: 'NOT_VERIFIED',
    gates: { [gate]: { status: 'NOT_VERIFIED' } },
    checks: { note: 'Independent verification required; not inferred from /readiness alone' },
  });
}

writePhase8Evidence('dr', {
  environment,
  result: 'NOT_VERIFIED',
  gates: { DR: { status: 'NOT_VERIFIED' }, BACKUP: { status: 'NOT_VERIFIED' } },
  classes: {
    LOCAL_DUMP: 'HISTORICAL_PASSED_NOT_PROD_RTO',
    STAGING_PITR: 'NOT_VERIFIED',
    PRODUCTION_CLASS_PITR: 'NOT_VERIFIED',
  },
});

writePhase8Evidence('pitr', {
  environment,
  result: 'NOT_VERIFIED',
  gates: { PITR: { status: 'NOT_VERIFIED' } },
  restore_start: null,
  restore_finish: null,
  wal_position: null,
  note: 'No PITR executed this phase',
});

writePhase8Evidence('rpo', {
  environment,
  result: 'NOT_VERIFIED',
  gates: { RPO: { status: 'NOT_VERIFIED' } },
  RPO_target: 'OPERATOR_DEFINED',
  RPO_verified: null,
});

writePhase8Evidence('rto', {
  environment,
  result: 'NOT_VERIFIED',
  gates: { RTO: { status: 'NOT_VERIFIED' } },
  RTO_target: 'OPERATOR_DEFINED',
  RTO_verified: null,
});

writePhase8Evidence('reconciliation', {
  environment,
  result: 'NOT_VERIFIED',
  gates: { RECONCILIATION: { status: 'NOT_VERIFIED' } },
  note: 'Flag-only engine preserved; local finance:reconcile previously hit duplicate-key — not hidden',
  autoRepair: false,
});

writePhase8Evidence('ledger', {
  environment,
  result: environment === 'production' ? 'NOT_VERIFIED' : 'NOT_VERIFIED',
  gates: { LEDGER: { status: 'NOT_VERIFIED' }, FINANCE: { status: 'NOT_VERIFIED' } },
  note: 'Run npm run finance:investigate and attach counts; production PASS only when actionable=0 on prod DB',
  autoRepair: false,
});

console.log(JSON.stringify({
  event: 'PHASE8_EVIDENCE_STUBS',
  environment,
  testFundingStatus: tfStatus,
  productionAssumed: false,
  autoRepair: false,
}, null, 2));
