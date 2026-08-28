#!/usr/bin/env node
/**
 * Security certification — safe automated probes + evidence.
 * Never prints secrets. Never mutates money.
 *
 * Credentialed MFA/RBAC/CSRF matrix requires SMOKE_* env vars;
 * without them gates remain NOT_VERIFIED / BLOCKED for production.
 */
import dotenv from 'dotenv';
dotenv.config();

import { writePhase8Evidence } from '../lib/certificationEvidence.mjs';

function arg(name, fallback = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const environment = String(arg('environment', process.env.CERT_ENV || 'local')).toLowerCase();
const baseUrl = String(arg('base-url', process.env.SMOKE_BASE_URL || (environment === 'local' ? 'http://127.0.0.1:5001' : 'https://oddsyra.com'))).replace(/\/$/, '');
const prodOk = arg('i-understand-production') === '1' || process.env.SECURITY_CERT_ALLOW_PROD === '1';

if (environment === 'production' && !prodOk) {
  const blocked = writePhase8Evidence('security', {
    environment: 'production',
    result: 'BLOCKED',
    blocked: true,
    blockReason: 'Pass --i-understand-production=1 for production security certification',
    gates: {
      MFA: { status: 'BLOCKED' },
      RBAC: { status: 'BLOCKED' },
      CSRF: { status: 'BLOCKED' },
      AUTHENTICATION: { status: 'BLOCKED' },
      SECURITY: { status: 'BLOCKED' },
    },
  });
  console.log(JSON.stringify({ event: 'SECURITY_CERTIFICATION', ...blocked.body, path: blocked.relativePath }, null, 2));
  process.exit(2);
}

function redact(s) {
  return String(s || '')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[JWT_REDACTED]');
}

async function probe(name, path, init = {}) {
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...(init.headers || {}) },
      redirect: 'manual',
    });
    const text = await res.text().catch(() => '');
    return { name, ok: true, status: res.status, bodySnippet: redact(text).slice(0, 120) };
  } catch (err) {
    return { name, ok: false, status: null, error: String(err.message || err).slice(0, 160) };
  }
}

const cases = [];
cases.push(await probe('unauthenticated_admin', '/api/admin/operations/production-readiness'));
cases.push(await probe('unauthenticated_certification', '/api/admin/operations/production-certification'));
cases.push(await probe('invalid_bearer', '/api/admin/operations/health', {
  headers: { Authorization: 'Bearer invalid.token.value' },
}));
cases.push(await probe('public_readiness', '/readiness'));
cases.push(await probe('public_liveness', '/liveness'));

const hasCreds = Boolean(process.env.SMOKE_ADMIN_TOKEN || process.env.SMOKE_ADMIN_USER);
const checks = {
  unauthenticated_admin_denied: cases.find((c) => c.name === 'unauthenticated_admin'),
  invalid_bearer_denied: cases.find((c) => c.name === 'invalid_bearer'),
  public_readiness: cases.find((c) => c.name === 'public_readiness'),
};

const authPass = checks.unauthenticated_admin_denied?.status === 401
  || checks.unauthenticated_admin_denied?.status === 403;
const invalidPass = checks.invalid_bearer_denied?.status === 401
  || checks.invalid_bearer_denied?.status === 403;
const readyPass = checks.public_readiness?.status === 200;

const gates = {
  AUTHENTICATION: {
    status: authPass && invalidPass ? 'PASS' : (checks.unauthenticated_admin_denied?.ok === false ? 'BLOCKED' : 'FAIL'),
    notes: 'Unauth + invalid bearer probes only',
  },
  MFA: {
    status: hasCreds ? 'NOT_VERIFIED' : (environment === 'production' ? 'NOT_VERIFIED' : 'NOT_VERIFIED'),
    notes: hasCreds
      ? 'Credentials present but full TOTP matrix not executed in this script'
      : 'Set SMOKE_ADMIN_TOKEN / MFA test procedure for live MFA PASS',
  },
  RBAC: {
    status: 'NOT_VERIFIED',
    notes: 'Role matrix requires provisioned admin roles — not auto PASS',
  },
  CSRF: {
    status: 'NOT_VERIFIED',
    notes: 'Cookie CSRF matrix requires browser session — not auto PASS',
  },
  SECURITY: {
    status: authPass && readyPass ? 'NOT_VERIFIED' : 'FAIL',
    notes: 'Partial automated surface only; full SECURITY PASS needs MFA+RBAC+CSRF evidence',
  },
  AUDIT_LOGGING: {
    status: 'NOT_VERIFIED',
    notes: 'Requires credentialed privileged action + audit row inspect',
  },
};

const { getConfigurationHealth } = await import('../lib/configHealthEngine.mjs');
const config = getConfigurationHealth();
const secretsLeak = JSON.stringify(config).match(/eyJ[A-Za-z0-9_-]+\.|postgres(ql)?:\/\/[^:]+:[^@]+@/i);

const written = writePhase8Evidence('security', {
  environment,
  baseUrl,
  result: Object.values(gates).some((g) => g.status === 'FAIL') ? 'FAIL' : 'NOT_VERIFIED',
  gates,
  cases,
  credentialedMatrixExecuted: false,
  configOverall: config.overall,
  secretsPrinted: false,
  secretsLeakDetected: Boolean(secretsLeak),
  notes: 'Automated partial certification. MFA/RBAC/CSRF remain NOT_VERIFIED until credentialed evidence.',
});

console.log(JSON.stringify({
  event: 'SECURITY_CERTIFICATION',
  environment,
  result: written.body.result,
  gates,
  path: written.relativePath,
  secretsPrinted: false,
}, null, 2));
process.exit(gates.AUTHENTICATION.status === 'FAIL' ? 2 : 0);
