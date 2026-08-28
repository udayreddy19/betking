#!/usr/bin/env node
/**
 * Production certification preflight — env/secrets presence only.
 * Never prints secret values.
 */
import dotenv from 'dotenv';
dotenv.config();

import { writePhase8Evidence } from '../lib/certificationEvidence.mjs';
import { getConfigurationHealth } from '../lib/configHealthEngine.mjs';

function classify(key) {
  const v = process.env[key];
  if (v === undefined || v === null || String(v).length === 0) return 'MISSING';
  const s = String(v);
  if (/CHANGE_ME|oddsyra_jwt_secret_dev_key|password|secret123/i.test(s)) return 'INVALID_FORMAT';
  return 'SET';
}

const keys = [
  'NODE_ENV', 'DATABASE_URL', 'REDIS_URL', 'JWT_SECRET',
  'FRONTEND_URL', 'CORS_ORIGIN', 'DEMO_MODE', 'COOKIE_SECURE', 'SMTP_HOST',
];
const configuration = {};
for (const k of keys) configuration[k] = classify(k);

const secrets = {
  JWT_SECRET: classify('JWT_SECRET'),
  DATABASE_URL: process.env.DATABASE_URL ? 'SET' : 'MISSING',
  REDIS_URL: process.env.REDIS_URL ? 'SET' : 'MISSING',
};
// Never include values
const configHealth = getConfigurationHealth();
const env = String(process.env.CERT_ENV || process.env.NODE_ENV || 'local').toLowerCase();

const criticalMissing = Object.entries(configuration).filter(([, v]) => v === 'MISSING' || v === 'INVALID_FORMAT');
const result = criticalMissing.some(([k]) => ['DATABASE_URL', 'JWT_SECRET'].includes(k))
  ? 'FAIL'
  : (criticalMissing.length ? 'NOT_VERIFIED' : 'NOT_VERIFIED');

writePhase8Evidence('configuration', {
  environment: env,
  result,
  gates: { CONFIGURATION: { status: result === 'FAIL' ? 'FAIL' : 'NOT_VERIFIED' } },
  checks: configuration,
  configHealthOverall: configHealth.overall,
  secretsPrinted: false,
});

writePhase8Evidence('secrets', {
  environment: env,
  result: secrets.JWT_SECRET === 'SET' ? 'NOT_VERIFIED' : 'FAIL',
  gates: { SECRETS: { status: secrets.JWT_SECRET === 'SET' && secrets.DATABASE_URL === 'SET' ? 'NOT_VERIFIED' : 'FAIL' } },
  checks: secrets,
  secretsPrinted: false,
  note: 'Presence only — not production secret rotation verification',
});

writePhase8Evidence('deployment', {
  environment: env,
  result: 'NOT_VERIFIED',
  gates: { DEPLOYMENT: { status: 'NOT_VERIFIED' } },
  checks: {
    NODE_ENV: configuration.NODE_ENV,
    httpsPublicProbe: 'NOT_VERIFIED',
    workers: 'NOT_VERIFIED',
    rollbackPlan: 'DOCUMENTED',
  },
  note: 'Deployment PASS requires target-env smoke + version evidence',
  secretsPrinted: false,
});

console.log(JSON.stringify({
  event: 'PRODUCTION_CERTIFICATION_PREFLIGHT',
  environment: env,
  configuration,
  secrets,
  secretsPrinted: false,
  result,
}, null, 2));
process.exit(result === 'FAIL' ? 2 : 0);
