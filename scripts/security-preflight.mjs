#!/usr/bin/env node
/**
 * Security preflight — config-level only (no live MFA smoke unless env allows).
 * Never prints secrets.
 */
import dotenv from 'dotenv';
dotenv.config();

import { getConfigurationHealth } from '../lib/configHealthEngine.mjs';

const config = getConfigurationHealth();
const checklist = [
  { id: 'DEMO_MODE', status: config.checks.find((c) => c.id === 'demo_mode')?.status || 'NOT VERIFIED' },
  { id: 'JWT_PRESENT', status: config.checks.find((c) => c.id === 'secret_JWT_SECRET')?.status || 'NOT VERIFIED' },
  { id: 'CORS', status: config.checks.find((c) => c.id === 'cors_origin')?.status || 'NOT VERIFIED' },
  { id: 'LIVE_MFA_SMOKE', status: 'NOT VERIFIED', note: 'Run SECURITY_VERIFICATION_CHECKLIST.md on target' },
  { id: 'LIVE_RBAC_SMOKE', status: 'NOT VERIFIED' },
  { id: 'LIVE_CSRF_SMOKE', status: 'NOT VERIFIED' },
  { id: 'MAKER_CHECKER', status: 'NOT VERIFIED', note: 'Covered by unit/integration tests locally; live dual-admin smoke required for production GREEN' },
];

const report = {
  event: 'SECURITY_PREFLIGHT',
  configOverall: config.overall,
  checklist,
  secretsPrinted: false,
  generatedAt: new Date().toISOString(),
  evidenceRule: 'Config checks ≠ live MFA/RBAC/CSRF verification',
};

console.log(JSON.stringify(report, null, 2));
process.exit(config.overall === 'CRITICAL' ? 2 : 0);
