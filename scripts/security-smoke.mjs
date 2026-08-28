#!/usr/bin/env node
/**
 * Security smoke — non-destructive authz/CSRF checks.
 * Never prints secrets/tokens/passwords.
 *
 * Usage:
 *   node scripts/security-smoke.mjs --environment=local
 *   node scripts/security-smoke.mjs --environment=staging --base-url=https://staging.example
 *   node scripts/security-smoke.mjs --environment=production --base-url=https://oddsyra.com --i-understand-production=1
 */
import dotenv from 'dotenv';
dotenv.config();

function arg(name, fallback = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`) || process.argv.some((a) => a.startsWith(`--${name}=`));
}

function redact(s) {
  return String(s || '')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[JWT_REDACTED]');
}

const environment = String(arg('environment', 'local')).toLowerCase();
const baseUrl = String(arg('base-url', process.env.SMOKE_BASE_URL || (environment === 'local' ? 'http://127.0.0.1:5001' : ''))).replace(/\/$/, '');
const prodOk = arg('i-understand-production') === '1' || process.env.SECURITY_SMOKE_ALLOW_PROD === '1';

if (!baseUrl) {
  console.log(JSON.stringify({
    event: 'SECURITY_SMOKE',
    environment,
    status: 'NOT VERIFIED',
    error: 'MISSING_BASE_URL',
    remediation: 'Pass --base-url=https://...',
  }, null, 2));
  process.exit(2);
}

if (environment === 'production' && !prodOk) {
  console.log(JSON.stringify({
    event: 'SECURITY_SMOKE',
    environment,
    status: 'NOT VERIFIED',
    error: 'PRODUCTION_NOT_ENABLED',
    remediation: 'Pass --i-understand-production=1 for explicit production smoke',
  }, null, 2));
  process.exit(2);
}

async function probe(name, path, init = {}) {
  const url = `${baseUrl}${path}`;
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.headers || {}),
      },
      redirect: 'manual',
    });
    const text = await res.text().catch(() => '');
    return {
      name,
      ok: true,
      status: res.status,
      bodySnippet: redact(text).slice(0, 160),
    };
  } catch (err) {
    return {
      name,
      ok: false,
      status: null,
      error: String(err.message || err).slice(0, 160),
    };
  }
}

const cases = [];

cases.push(await probe('unauthenticated_admin_ops', '/api/admin/operations/production-readiness'));
cases.push(await probe('unauthenticated_finance', '/api/admin/finance/daily-closing'));
cases.push(await probe('readiness_public', '/readiness'));
cases.push(await probe('invalid_bearer_admin', '/api/admin/operations/health', {
  headers: { Authorization: 'Bearer invalid.token.value' },
}));
cases.push(await probe('csrf_missing_cookie_mutation_shape', '/api/auth/logout', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{}',
}));

const classified = cases.map((c) => {
  let verdict = 'NOT VERIFIED';
  if (!c.ok) verdict = 'YELLOW';
  else if (c.name === 'readiness_public') verdict = c.status === 200 ? 'GREEN' : 'YELLOW';
  else if (c.name.startsWith('unauthenticated') || c.name === 'invalid_bearer_admin') {
    verdict = [401, 403].includes(c.status) ? 'GREEN' : 'RED';
  } else if (c.name.startsWith('csrf_')) {
    // Logout without session may 401 — acceptable; 200 without CSRF on cookie session would be RED but we cannot assert without cookie
    verdict = [200, 401, 403, 400].includes(c.status) ? 'YELLOW' : 'NOT VERIFIED';
  }
  return { ...c, verdict };
});

const hasRed = classified.some((c) => c.verdict === 'RED');
const report = {
  event: 'SECURITY_SMOKE',
  environment,
  baseUrl,
  destructive: false,
  financialMutation: false,
  secretsPrinted: false,
  cases: classified,
  matrixNote: 'Maker/checker dual-admin and role matrix require provisioned credentials — NOT VERIFIED here',
  rolesNotExecuted: [
    'authenticated_non_admin',
    'read_only_admin',
    'finance_maker',
    'finance_checker',
    'super_admin',
    'mfa_required_admin',
    'maker_approve_own',
    'privilege_escalation',
  ],
  overall: hasRed ? 'RED' : classified.every((c) => c.verdict === 'GREEN') ? 'YELLOW' : 'NOT VERIFIED',
  evidenceRule: 'Partial smoke only. Full MFA/RBAC/CSRF GREEN requires credentialed live matrix.',
  generatedAt: new Date().toISOString(),
};

console.log(JSON.stringify(report, null, 2));
process.exit(hasRed ? 2 : 0);
