#!/usr/bin/env node
/**
 * ODDSYRA — Production Deployment Preflight & Environment Validator
 *
 * Usage:
 *   node scripts/preflight-production.mjs
 *   node scripts/preflight-production.mjs --validate-only
 *
 * Rules:
 * - Validates production configuration structure and security invariants.
 * - NEVER prints secret values to console or logs.
 * - Exits with non-zero status (1) if any FAIL checks exist.
 */

import dotenv from 'dotenv';
dotenv.config();

const isValidateOnly = process.argv.includes('--validate-only');
const env = process.env;
const isProd = env.NODE_ENV === 'production';

const checks = [];

function recordCheck(category, item, status, message) {
  checks.push({ category, item, status, message });
}

// ── 1. CORE ENVIRONMENT & RUNTIME ──
if (isProd) {
  recordCheck('RUNTIME', 'NODE_ENV', 'PASS', 'NODE_ENV is set to production');
} else {
  recordCheck('RUNTIME', 'NODE_ENV', 'WARN', `NODE_ENV is '${env.NODE_ENV || 'unset'}' (expected 'production' for live deployment)`);
}

// ── 2. DATABASE CONFIGURATION ──
if (!env.DATABASE_URL) {
  recordCheck('DATABASE', 'DATABASE_URL', 'FAIL', 'DATABASE_URL is missing');
} else if (isProd && (env.DATABASE_URL.includes('oddsyra_dev_pass') || env.DATABASE_URL.includes('CHANGE_ME'))) {
  recordCheck('DATABASE', 'DATABASE_URL', 'FAIL', 'DATABASE_URL contains unsafe development credentials');
} else {
  recordCheck('DATABASE', 'DATABASE_URL', 'PASS', 'DATABASE_URL is configured');
}

// ── 3. REDIS CONFIGURATION ──
if (!env.REDIS_URL) {
  recordCheck('CACHE', 'REDIS_URL', 'WARN', 'REDIS_URL is missing (system will use local memory fallback)');
} else {
  recordCheck('CACHE', 'REDIS_URL', 'PASS', 'REDIS_URL is configured');
}

// ── 4. JWT SECRET HARDENING ──
const jwt = String(env.JWT_SECRET || '');
const forbiddenPlaceholders = [
  'changeme',
  'secret',
  'test',
  'development',
  'example',
  'your-secret',
  'oddsyra_jwt_secret_dev_key_2026',
  'oddsyra_dev_pass',
];

if (!jwt) {
  recordCheck('SECURITY', 'JWT_SECRET', 'FAIL', 'JWT_SECRET is missing');
} else if (jwt.length < 32) {
  recordCheck('SECURITY', 'JWT_SECRET', 'FAIL', `JWT_SECRET is too short (${jwt.length} chars, min 32 required)`);
} else if (forbiddenPlaceholders.some((p) => jwt.toLowerCase().includes(p))) {
  recordCheck('SECURITY', 'JWT_SECRET', 'FAIL', 'JWT_SECRET contains an insecure placeholder phrase');
} else {
  recordCheck('SECURITY', 'JWT_SECRET', 'PASS', 'JWT_SECRET meets 32+ char cryptographic requirements');
}

// ── 5. CORS & ORIGIN POLICY ──
const cors = String(env.CORS_ORIGIN || env.CORS_ALLOWED_ORIGINS || '');
if (!cors && isProd) {
  recordCheck('NETWORK', 'CORS_ORIGIN', 'FAIL', 'CORS_ORIGIN is missing in production');
} else if (cors === '*' || cors.includes('*')) {
  recordCheck('NETWORK', 'CORS_ORIGIN', 'FAIL', 'CORS wildcard (*) is forbidden with credentialed cookies');
} else if (isProd && (cors.includes('localhost') || cors.includes('127.0.0.1'))) {
  recordCheck('NETWORK', 'CORS_ORIGIN', 'WARN', 'CORS_ORIGIN contains localhost/127.0.0.1 in production');
} else {
  recordCheck('NETWORK', 'CORS_ORIGIN', 'PASS', 'CORS_ORIGIN is configured safely without wildcards');
}

// ── 6. DEVELOPMENT BYPASS DEFENSES ──
if (isProd && (env.ADMIN_DEV_LOGIN === '1' || env.ADMIN_DEV_LOGIN === 'true')) {
  recordCheck('SECURITY', 'ADMIN_DEV_LOGIN', 'FAIL', 'ADMIN_DEV_LOGIN is enabled in production');
} else {
  recordCheck('SECURITY', 'ADMIN_DEV_LOGIN', 'PASS', 'Development admin login bypass is disabled');
}

if (isProd && (env.DEMO_MODE === '1' || env.DEMO_MODE === 'true' || env.VITE_DEMO_MODE === '1')) {
  recordCheck('SECURITY', 'DEMO_MODE', 'FAIL', 'DEMO_MODE / VITE_DEMO_MODE must not be enabled in production');
} else {
  recordCheck('SECURITY', 'DEMO_MODE', 'PASS', 'Demo mode is disabled');
}

if (isProd && (env.E2E_HARNESS === '1' || env.E2E_HARNESS === 'true')) {
  recordCheck('SECURITY', 'E2E_HARNESS', 'FAIL', 'E2E_HARNESS route bypass must not be enabled in production');
} else {
  recordCheck('SECURITY', 'E2E_HARNESS', 'PASS', 'E2E testing harness routes are disabled');
}

// ── 7. PAYMENT PROVIDERS CONSISTENCY ──
const rzpKey = env.RAZORPAY_KEY_ID;
const rzpSec = env.RAZORPAY_KEY_SECRET;
const rzpWh = env.RAZORPAY_WEBHOOK_SECRET;
const hasRzp = Boolean(rzpKey || rzpSec || rzpWh);

if (hasRzp) {
  if (!rzpKey || !rzpSec || !rzpWh) {
    recordCheck('PAYMENTS', 'Razorpay Config', 'FAIL', 'Incomplete Razorpay configuration (KEY_ID, KEY_SECRET, and WEBHOOK_SECRET are all required)');
  } else if (isProd && (rzpSec.includes('CHANGE_ME') || rzpWh.includes('CHANGE_ME'))) {
    recordCheck('PAYMENTS', 'Razorpay Config', 'FAIL', 'Razorpay secrets contain placeholder values');
  } else {
    recordCheck('PAYMENTS', 'Razorpay Config', 'PASS', 'Razorpay configuration structure is complete');
  }
} else {
  recordCheck('PAYMENTS', 'Razorpay Config', 'WARN', 'Razorpay credentials not set (payment gateway will be disabled)');
}

const cfApp = env.CASHFREE_APP_ID;
const cfSec = env.CASHFREE_SECRET_KEY;
const cfWh = env.CASHFREE_WEBHOOK_SECRET;
const hasCf = Boolean(cfApp || cfSec || cfWh);

if (hasCf) {
  if (!cfApp || !cfSec || !cfWh) {
    recordCheck('PAYMENTS', 'Cashfree Config', 'FAIL', 'Incomplete Cashfree configuration (APP_ID, SECRET_KEY, and WEBHOOK_SECRET are all required)');
  } else if (isProd && (cfSec.includes('CHANGE_ME') || cfWh.includes('CHANGE_ME'))) {
    recordCheck('PAYMENTS', 'Cashfree Config', 'FAIL', 'Cashfree secrets contain placeholder values');
  } else {
    recordCheck('PAYMENTS', 'Cashfree Config', 'PASS', 'Cashfree configuration structure is complete');
  }
} else {
  recordCheck('PAYMENTS', 'Cashfree Config', 'WARN', 'Cashfree credentials not set (payment gateway will be disabled)');
}

// ── 8. MONITORING & METRICS ──
if (isProd && !env.METRICS_TOKEN) {
  recordCheck('MONITORING', 'METRICS_TOKEN', 'WARN', 'METRICS_TOKEN is unset in production (metrics restricted to localhost only)');
} else {
  recordCheck('MONITORING', 'METRICS_TOKEN', 'PASS', 'Metrics endpoint security configured');
}

// ── 9. PRINT AUDIT REPORT TABLE ──
console.log('\n======================================================================');
console.log('       ODDSYRA PRODUCTION PREFLIGHT CONFIGURATION VALIDATION           ');
console.log('======================================================================\n');

let failCount = 0;
let warnCount = 0;
let passCount = 0;

console.log(
  `${'CATEGORY'.padEnd(12)} | ${'ITEM'.padEnd(20)} | ${'STATUS'.padEnd(6)} | MESSAGE`
);
console.log('-'.repeat(70));

for (const c of checks) {
  let icon = '🟢';
  if (c.status === 'FAIL') {
    icon = '🔴';
    failCount++;
  } else if (c.status === 'WARN') {
    icon = '🟡';
    warnCount++;
  } else {
    passCount++;
  }

  console.log(
    `${c.category.padEnd(12)} | ${c.item.padEnd(20)} | ${icon} ${c.status.padEnd(4)} | ${c.message}`
  );
}

console.log('\n' + '='.repeat(70));
console.log(`SUMMARY: ${passCount} PASSED, ${warnCount} WARNINGS, ${failCount} FAILED`);
console.log('='.repeat(70) + '\n');

if (failCount > 0) {
  console.error('❌ PREFLIGHT VALIDATION FAILED: Resolve critical configuration errors before deploying to production.\n');
  process.exit(1);
} else {
  console.log('✅ PREFLIGHT VALIDATION SUCCESSFUL: Configuration structure conforms to production standards.\n');
  process.exit(0);
}
