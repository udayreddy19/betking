#!/usr/bin/env node
/**
 * Safe production readiness check (read-only).
 * Usage: node scripts/readiness-check.mjs [--environment=local|staging|production]
 */
import dotenv from 'dotenv';
dotenv.config();

const envArg = process.argv.find((a) => a.startsWith('--environment='));
const environment = envArg ? envArg.split('=')[1] : (process.env.READINESS_ENV || 'local');

const { buildProductionReadiness } = await import('../lib/productionReadinessEngine.mjs');
const report = await buildProductionReadiness({ environment });

const out = {
  event: 'PRODUCTION_READINESS_CHECK',
  overall: report.overall,
  environment: report.environment,
  goNoGo: report.goNoGo,
  testFundingCode: report.testFunding?.code,
  goLiveBlocked: report.testFunding?.goLiveBlocked,
  residualTotal: report.testFunding?.residualTotal ?? null,
  mismatchCounts: report.mismatchCounts || null,
  blockingGateIds: report.blockingGateIds || [],
  whyNotGreenTop: (report.whyNotGreen || []).slice(0, 25),
  gates: (report.gates || []).map((g) => ({
    id: g.id,
    status: g.status,
    blocking: Boolean(g.blocking),
    severity: g.severity,
  })),
  generatedAt: report.generatedAt,
  autoRepair: false,
  evidenceRule: report.evidenceRule,
};

console.log(JSON.stringify(out, null, 2));
process.exit(report.overall === 'RED' || report.testFunding?.goLiveBlocked ? 2 : 0);
