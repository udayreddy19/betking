#!/usr/bin/env node
/**
 * Phase 9 certify — run go-live-check evidence emit + production certification.
 * Never force-GREEN. Writes docs/evidence/phase9/VERIFICATION_SUMMARY.json
 */
import dotenv from 'dotenv';
dotenv.config();

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildProductionCertification } from '../lib/productionCertificationEngine.mjs';
import { ensurePhase9EvidenceDir, writePhase9Evidence, PHASE9_EVIDENCE_DIR } from '../lib/certificationEvidence.mjs';

function arg(name, fallback = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const environment = String(arg('environment', process.env.CERT_ENV || 'production')).toLowerCase();
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
ensurePhase9EvidenceDir();

spawnSync(process.execPath, ['scripts/production-go-live-check.mjs', `--environment=${environment}`], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});

const cert = await buildProductionCertification({ environment });

const summary = {
  phase: 9,
  environment,
  timestamp: new Date().toISOString(),
  gitCommit: cert.gitCommit,
  result: cert.PRODUCTION_CERTIFICATION_STATUS,
  PRODUCTION_CERTIFICATION_STATUS: cert.PRODUCTION_CERTIFICATION_STATUS,
  productionClaimAllowed: cert.productionClaimAllowed,
  goNoGo: cert.goNoGo,
  passedGates: cert.passedGates,
  failedGates: cert.failedGates,
  notVerifiedGates: cert.notVerifiedGates,
  blockedGates: cert.blockedGates,
  mandatoryBlockers: cert.goNoGo.mandatoryBlockers,
  evidenceCompleteness: cert.evidenceCompleteness,
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
  autoRepair: false,
  secretsPrinted: false,
  forceGreenAllowed: false,
};

writePhase9Evidence('certification', summary);
fs.writeFileSync(path.join(PHASE9_EVIDENCE_DIR, 'VERIFICATION_SUMMARY.json'), JSON.stringify(summary, null, 2));
fs.writeFileSync(
  path.join(PHASE9_EVIDENCE_DIR, 'FINAL_STATUS.txt'),
  [
    `PRODUCTION_CERTIFICATION_STATUS=${summary.PRODUCTION_CERTIFICATION_STATUS}`,
    `GO_NO_GO=${summary.goNoGo.decision}`,
    `productionClaimAllowed=${summary.productionClaimAllowed}`,
    `forceGreenAllowed=false`,
    `autoRepair=false`,
    `mandatoryBlockers=${(summary.mandatoryBlockers || []).length}`,
    `generatedAt=${summary.timestamp}`,
    '',
  ].join('\n'),
);

console.log(JSON.stringify({
  event: 'PHASE9_CERTIFY',
  PRODUCTION_CERTIFICATION_STATUS: summary.PRODUCTION_CERTIFICATION_STATUS,
  productionClaimAllowed: summary.productionClaimAllowed,
  goNoGo: summary.goNoGo.decision,
  mandatoryBlockers: summary.mandatoryBlockers?.slice(0, 20),
  summaryPath: 'docs/evidence/phase9/VERIFICATION_SUMMARY.json',
}, null, 2));

process.exit(summary.productionClaimAllowed ? 0 : 2);
