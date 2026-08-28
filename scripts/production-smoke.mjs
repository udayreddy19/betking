#!/usr/bin/env node
/**
 * Production smoke — non-destructive by default.
 * Financial bet/withdrawal steps are BLOCKED unless --allow-financial-smoke=1
 * and operator credentials are provided (still prefer staging).
 */
import dotenv from 'dotenv';
dotenv.config();

import { writePhase8Evidence } from '../lib/certificationEvidence.mjs';

function arg(name, fallback = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const environment = String(arg('environment', 'local')).toLowerCase();
const baseUrl = String(arg('base-url', process.env.SMOKE_BASE_URL || (environment === 'local' ? 'http://127.0.0.1:5001' : 'https://oddsyra.com'))).replace(/\/$/, '');
const prodOk = arg('i-understand-production') === '1' || process.env.PRODUCTION_SMOKE_ALLOW === '1';
const allowFinancial = arg('allow-financial-smoke') === '1';

if (environment === 'production' && !prodOk) {
  const w = writePhase8Evidence('production-smoke', {
    environment: 'production',
    result: 'BLOCKED',
    blocked: true,
    blockReason: 'Pass --i-understand-production=1',
    gates: { PRODUCTION_SMOKE: { status: 'BLOCKED' } },
  });
  console.log(JSON.stringify({ event: 'PRODUCTION_SMOKE', ...w.body, path: w.relativePath }, null, 2));
  process.exit(2);
}

async function get(path) {
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'OddsYraPhase8Smoke/1.0' },
      redirect: 'manual',
    });
    const ct = res.headers.get('content-type') || '';
    const text = await res.text();
    const isJson = ct.includes('application/json');
    return { path, status: res.status, contentType: ct, isJson, bodySnippet: text.slice(0, 160) };
  } catch (err) {
    return { path, status: null, error: String(err.message || err).slice(0, 160) };
  }
}

const steps = [];
const add = (id, result, detail) => steps.push({ id, result, detail });

const readiness = await get('/readiness');
add('public_readiness', readiness.status === 200 && readiness.isJson && /"ready"\s*:\s*true/.test(readiness.bodySnippet) ? 'PASS' : 'FAIL', readiness);

const liveness = await get('/liveness');
add('public_liveness', liveness.status === 200 && liveness.isJson ? 'PASS' : 'FAIL', liveness);

const healthLive = await get('/health/live');
add('health_live', healthLive.status === 200 && healthLive.isJson ? 'PASS'
  : (healthLive.status === 200 && !healthLive.isJson ? 'NOT_VERIFIED' : 'FAIL'),
{ ...healthLive, note: 'SPA HTML means alias not deployed' });

const healthReady = await get('/health/ready');
add('health_ready', healthReady.status === 200 && healthReady.isJson ? 'PASS'
  : (healthReady.status === 200 && !healthReady.isJson ? 'NOT_VERIFIED' : 'FAIL'), healthReady);

const healthDeps = await get('/health/dependencies');
add('health_dependencies', healthDeps.status === 200 && healthDeps.isJson ? 'PASS'
  : (healthDeps.status === 200 && !healthDeps.isJson ? 'NOT_VERIFIED' : 'FAIL'), healthDeps);

const adminUnauth = await get('/api/admin/operations/production-readiness');
add('admin_unauthenticated', [401, 403].includes(adminUnauth.status) ? 'PASS' : 'FAIL', adminUnauth);

const certUnauth = await get('/api/admin/operations/production-certification');
add('certification_unauthenticated', [401, 403].includes(certUnauth.status) ? 'PASS' : 'FAIL', certUnauth);

// Remaining steps require credentials / operator approval
const credentialed = [
  'authentication', 'mfa', 'rbac', 'admin_shell', 'customer_lookup', 'customer_360',
  'wallet_readonly', 'bet_slip', 'odds_changed', 'odds_acceptance',
  'bet_placement', 'settlement', 'withdrawal_request', 'maker_checker',
  'reconciliation', 'notifications', 'outbox', 'worker', 'redis', 'websocket', 'audit_log',
];
for (const id of credentialed) {
  if (['bet_placement', 'settlement', 'withdrawal_request'].includes(id) && !allowFinancial) {
    add(id, 'BLOCKED', { note: 'Financial smoke blocked — pass --allow-financial-smoke=1 only with operator approval' });
  } else {
    add(id, 'NOT_VERIFIED', { note: 'Requires credentialed operator procedure — see docs/PHASE_8_PRODUCTION_SMOKE_TEST.md' });
  }
}

const fail = steps.some((s) => s.result === 'FAIL');
const allCorePass = ['public_readiness', 'public_liveness', 'admin_unauthenticated']
  .every((id) => steps.find((s) => s.id === id)?.result === 'PASS');

const written = writePhase8Evidence('production-smoke', {
  environment,
  baseUrl,
  result: fail ? 'FAIL' : 'NOT_VERIFIED',
  gates: {
    PRODUCTION_SMOKE: {
      status: fail ? 'FAIL' : 'NOT_VERIFIED',
      notes: allCorePass
        ? 'Public/unauth probes PASS; credentialed matrix NOT_VERIFIED'
        : 'Core public probes incomplete',
    },
  },
  steps,
  financialSmokeExecuted: false,
  allowFinancial,
});

console.log(JSON.stringify({
  event: 'PRODUCTION_SMOKE',
  environment,
  result: written.body.result,
  steps: steps.map((s) => ({ id: s.id, result: s.result })),
  path: written.relativePath,
}, null, 2));
process.exit(fail ? 2 : 0);
