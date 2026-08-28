#!/usr/bin/env node
/**
 * Deployment / config preflight — never prints secret values.
 * Usage: node scripts/deployment-preflight.mjs
 */
import dotenv from 'dotenv';
dotenv.config();

import { getConfigurationHealth } from '../lib/configHealthEngine.mjs';
import { checkMigrationsOnDiskAndDb } from '../lib/productionReadinessEngine.mjs';
import { inspectKnownTestFundingAccounts } from '../lib/knownTestFundingExclusions.mjs';

function classifyEnv(key) {
  const v = process.env[key];
  if (v === undefined || v === null || String(v).length === 0) return 'MISSING';
  const s = String(v);
  if (s.includes('CHANGE_ME') || s.includes('oddsyra_jwt_secret_dev_key')) return 'UNSAFE';
  return 'SET';
}

const keys = [
  'NODE_ENV',
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_SECRET',
  'FRONTEND_URL',
  'CORS_ORIGIN',
  'DEMO_MODE',
  'VITE_DEMO_MODE',
  'SMTP_HOST',
  'COOKIE_SECURE',
];

const envStatus = {};
for (const k of keys) envStatus[k] = classifyEnv(k);

const config = getConfigurationHealth();
const migrations = await checkMigrationsOnDiskAndDb();
const testFunding = await inspectKnownTestFundingAccounts().catch((e) => ({
  code: 'TEST_FUNDING_INSPECT_FAILED',
  error: e.message,
  goLiveBlocked: true,
}));

const critical = config.overall === 'CRITICAL'
  || envStatus.DATABASE_URL === 'MISSING'
  || envStatus.JWT_SECRET === 'MISSING'
  || envStatus.JWT_SECRET === 'UNSAFE'
  || (process.env.NODE_ENV === 'production' && (envStatus.DEMO_MODE === 'SET' && (process.env.DEMO_MODE === '1' || process.env.DEMO_MODE === 'true')));

const report = {
  event: 'DEPLOYMENT_PREFLIGHT',
  environment: process.env.NODE_ENV || 'development',
  envStatus,
  configOverall: config.overall,
  migrations: {
    status: migrations.status,
    onDisk: migrations.onDisk,
    appliedStatus: migrations.appliedStatus,
  },
  testFunding: {
    code: testFunding.code,
    goLiveBlocked: testFunding.goLiveBlocked,
    pendingCount: testFunding.pendingCount,
  },
  secretsPrinted: false,
  critical,
  generatedAt: new Date().toISOString(),
};

console.log(JSON.stringify(report, null, 2));
process.exit(critical ? 2 : 0);
