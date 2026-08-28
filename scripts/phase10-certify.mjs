#!/usr/bin/env node
/**
 * Phase 10 certify — emit evidence stubs (honest NOT_VERIFIED when unverified),
 * run production certification, write docs/evidence/phase10/.
 * Never force-GREEN. Never auto-repair wallets/ledger.
 */
import dotenv from 'dotenv';
dotenv.config();

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildProductionCertification } from '../lib/productionCertificationEngine.mjs';
import {
  ensurePhase10EvidenceDir,
  writePhase10Evidence,
  PHASE10_EVIDENCE_DIR,
  gitCommitSafe,
  readLatestEvidencePreferPhase9,
} from '../lib/certificationEvidence.mjs';

function arg(name, fallback = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const environment = String(arg('environment', process.env.CERT_ENV || 'production')).toLowerCase();
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
ensurePhase10EvidenceDir();

const NOT_VERIFIED_GATES = [
  'database', 'migrations', 'test-funding', 'ledger', 'reconciliation', 'security',
  'mfa', 'rbac', 'csrf', 'authentication',
  'workers', 'outbox', 'redis', 'websocket',
  'backup', 'dr', 'pitr', 'rpo', 'rto',
  'monitoring', 'deployment', 'secrets', 'configuration',
  'audit-logging', 'production-smoke', 'promotions', 'crm',
];

function emitNotVerifiedStub(name, extra = {}) {
  return writePhase10Evidence(name, {
    environment,
    result: 'NOT_VERIFIED',
    verificationMethod: extra.verificationMethod || 'phase10_stub',
    stub: extra.stub !== false,
    notes: extra.notes || 'Not independently verified for this claim environment. Do not fabricate PASS.',
    gates: {
      [String(name).toUpperCase().replace(/-/g, '_')]: {
        status: 'NOT_VERIFIED',
        notes: extra.notes || 'Awaiting production-class evidence',
      },
    },
    checks: extra.checks || {},
    ...extra,
  });
}

// Prefer existing go-live-check emit (phase9 paths); then layer phase10 stubs without inventing PASS
spawnSync(process.execPath, ['scripts/production-go-live-check.mjs', `--environment=${environment}`], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});

for (const name of NOT_VERIFIED_GATES) {
  // Do not mask non-stub phase9/phase10 evidence with a fresh stub
  const existingP10 = path.join(PHASE10_EVIDENCE_DIR, `${name}_latest.json`);
  let skip = false;
  if (fs.existsSync(existingP10)) {
    try {
      const doc = JSON.parse(fs.readFileSync(existingP10, 'utf8'));
      if (doc.stub !== true && doc.verificationMethod !== 'stub' && doc.verificationMethod !== 'phase10_stub') {
        skip = true;
      }
    } catch { /* rewrite */ }
  }
  // Also skip if phase9 already has non-stub PASS evidence for this gate
  try {
    const prior = readLatestEvidencePreferPhase9(name);
    if (prior && prior.stub !== true && prior.verificationMethod !== 'stub' && prior.result === 'PASS') {
      skip = true;
    }
  } catch { /* continue */ }
  if (skip) continue;

  const extras = {};
  if (name === 'monitoring') {
    extras.metricsBackend = 'PROCESS_LOCAL';
    extras.processLocal = true;
    extras.notes = 'PROCESS_LOCAL telemetry recorded; distributed MONITORING remains NOT_VERIFIED';
  }
  if (['workers', 'outbox', 'redis', 'websocket'].includes(name)) {
    extras.stub = true;
    extras.verificationMethod = 'stub';
  }
  if (name === 'pitr' || name === 'rpo' || name === 'rto') {
    extras.notes = 'PITR/RPO/RTO require PRODUCTION_CLASS_PITR evidence. SQL dump restore is not sufficient.';
    extras.dumpOnly = false;
  }
  if (name === 'test-funding') {
    extras.checks = {
      allResidualsZero: null,
      note: 'Requires inspectKnownTestFundingAccounts against production DB evidence',
    };
  }
  if (name === 'ledger') {
    extras.checks = {
      actionableMismatchCount: null,
      AUTO_REPAIR: false,
      note: 'Requires investigate_wallet_ledger_mismatches evidence for production',
    };
  }
  emitNotVerifiedStub(name, extras);
}

const cert = await buildProductionCertification({ environment });

const summary = {
  phase: 10,
  environment,
  timestamp: new Date().toISOString(),
  gitCommit: cert.gitCommit || gitCommitSafe(),
  result: cert.PRODUCTION_CERTIFICATION_STATUS,
  PRODUCTION_CERTIFICATION_STATUS: cert.PRODUCTION_CERTIFICATION_STATUS,
  productionClaimAllowed: cert.productionClaimAllowed,
  forceGreenAllowed: false,
  autoRepair: false,
  goNoGo: cert.goNoGo,
  summary: cert.summary,
  passedGates: cert.passedGates,
  failedGates: cert.failedGates,
  notVerifiedGates: cert.notVerifiedGates,
  blockedGates: cert.blockedGates,
  mandatoryBlockers: cert.goNoGo.mandatoryBlockers,
  evidenceCompleteness: cert.evidenceCompleteness,
  checklist: cert.checklist,
  security: cert.security,
  ledger: cert.ledger,
  testFunding: {
    code: cert.testFunding?.code,
    goLiveBlocked: cert.testFunding?.goLiveBlocked,
    note: 'Connected-DB inspect is not production unless evidence.environment=production',
  },
  dr: cert.dr,
  pitr: cert.pitr,
  rpo: cert.rpo,
  rto: cert.rto,
  deployment: cert.deployment,
  smoke: cert.smoke,
  secretsPrinted: false,
};

writePhase10Evidence('certification', summary);
fs.writeFileSync(path.join(PHASE10_EVIDENCE_DIR, 'VERIFICATION_SUMMARY.json'), JSON.stringify(summary, null, 2));
fs.writeFileSync(
  path.join(PHASE10_EVIDENCE_DIR, 'FINAL_STATUS.txt'),
  [
    `PRODUCTION_CERTIFICATION_STATUS=${summary.PRODUCTION_CERTIFICATION_STATUS}`,
    `GO_NO_GO=${summary.goNoGo.decision}`,
    `productionClaimAllowed=${summary.productionClaimAllowed}`,
    `forceGreenAllowed=false`,
    `autoRepair=false`,
    `mandatoryBlockers=${(summary.mandatoryBlockers || []).length}`,
    `certificationVersion=phase10`,
    `generatedAt=${summary.timestamp}`,
    '',
  ].join('\n'),
);

console.log(JSON.stringify({
  event: 'PHASE10_CERTIFY',
  PRODUCTION_CERTIFICATION_STATUS: summary.PRODUCTION_CERTIFICATION_STATUS,
  productionClaimAllowed: summary.productionClaimAllowed,
  forceGreenAllowed: false,
  autoRepair: false,
  goNoGo: summary.goNoGo.decision,
  mandatoryBlockers: summary.mandatoryBlockers?.slice(0, 25),
  summaryPath: 'docs/evidence/phase10/VERIFICATION_SUMMARY.json',
}, null, 2));

process.exit(summary.productionClaimAllowed ? 0 : 2);
