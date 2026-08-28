#!/usr/bin/env node
/**
 * Full production certification runner — aggregates readiness + evidence.
 * Writes docs/evidence/phase8/VERIFICATION_SUMMARY.json
 * Never mutates financial data. Never force-GREEN.
 */
import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildProductionCertification } from '../lib/productionCertificationEngine.mjs';
import { ensurePhase8EvidenceDir, writePhase8Evidence, PHASE8_EVIDENCE_DIR } from '../lib/certificationEvidence.mjs';

function arg(name, fallback = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const environment = String(arg('environment', process.env.CERT_ENV || 'local')).toLowerCase();
ensurePhase8EvidenceDir();

const cert = await buildProductionCertification({ environment });

const summary = {
  phase: 8,
  environment,
  timestamp: new Date().toISOString(),
  gitCommit: cert.gitCommit,
  result: cert.certificationStatus,
  PRODUCTION_CERTIFICATION_STATUS: cert.PRODUCTION_CERTIFICATION_STATUS,
  goNoGo: cert.goNoGo,
  passedGates: cert.passedGates,
  failedGates: cert.failedGates,
  notVerifiedGates: cert.notVerifiedGates,
  blockedGates: cert.blockedGates,
  mandatoryBlockers: cert.goNoGo.mandatoryBlockers,
  evidenceCompleteness: cert.evidenceCompleteness,
  mismatchCounts: cert.mismatchCounts,
  testFundingCode: cert.testFunding?.code,
  autoRepair: false,
  secretsPrinted: false,
  gates: Object.fromEntries(cert.gates.map((g) => [g.name, {
    status: g.status,
    required: g.required,
    verified: g.verified,
    evidencePath: g.evidencePath,
  }])),
};

const written = writePhase8Evidence('certification', summary);
fs.writeFileSync(
  path.join(PHASE8_EVIDENCE_DIR, 'VERIFICATION_SUMMARY.json'),
  JSON.stringify(summary, null, 2),
);

console.log(JSON.stringify({
  event: 'PRODUCTION_CERTIFICATION',
  PRODUCTION_CERTIFICATION_STATUS: summary.PRODUCTION_CERTIFICATION_STATUS,
  goNoGo: summary.goNoGo,
  mandatoryBlockers: summary.mandatoryBlockers,
  evidencePath: written.relativePath,
  summaryPath: 'docs/evidence/phase8/VERIFICATION_SUMMARY.json',
}, null, 2));

process.exit(
  summary.PRODUCTION_CERTIFICATION_STATUS === 'GREEN' ? 0
    : (summary.PRODUCTION_CERTIFICATION_STATUS === 'RED' || summary.goNoGo.decision === 'NO-GO' ? 2 : 1),
);
