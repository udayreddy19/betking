#!/usr/bin/env node
/**
 * Security certification — safe automated probes + credentialed matrix.
 * Never prints secrets. Never mutates money.
 *
 * Credentialed MFA/RBAC/CSRF matrix:
 *   - Prefer running scripts/pass6-security-matrix.mjs (provisions staging identities)
 *   - Or set SMOKE_ADMIN_TOKEN / SMOKE_ADMIN_USER for partial credentialed probes
 * Without credentialed evidence, MFA/RBAC remain NOT_VERIFIED / BLOCKED for production.
 */
import dotenv from 'dotenv';
dotenv.config({ quiet: true });

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { writePhase8Evidence } from '../lib/certificationEvidence.mjs';

function arg(name, fallback = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const environment = String(arg('environment', process.env.CERT_ENV || 'local')).toLowerCase();
const baseUrl = String(arg('base-url', process.env.SMOKE_BASE_URL || (environment === 'local' ? 'http://127.0.0.1:5001' : 'https://oddsyra.com'))).replace(/\/$/, '');
const prodOk = arg('i-understand-production') === '1' || process.env.SECURITY_CERT_ALLOW_PROD === '1';
const skipMatrix = arg('skip-matrix') === '1' || process.env.SECURITY_CERT_SKIP_MATRIX === '1';

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

async function probe(name, pathName, init = {}) {
  try {
    const res = await fetch(`${baseUrl}${pathName}`, {
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
cases.push(await probe('unauthenticated_trading_reconcile', '/api/admin/trading/exposure/reconcile'));
cases.push(await probe('invalid_bearer', '/api/admin/operations/health', {
  headers: { Authorization: 'Bearer invalid.token.value' },
}));
cases.push(await probe('public_readiness', '/readiness'));
cases.push(await probe('public_liveness', '/liveness'));

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

let matrixReport = null;
const rawPath = path.resolve('docs/evidence/pass6/security_matrix_raw.json');
const loadMatrixFile = () => {
  if (!fs.existsSync(rawPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(rawPath, 'utf8'));
  } catch {
    return null;
  }
};

if (!skipMatrix && (environment === 'local' || environment === 'staging' || environment === 'local-staging')) {
  const child = spawnSync(
    process.execPath,
    ['scripts/pass6-security-matrix.mjs', `--environment=${environment}`, `--base-url=${baseUrl}`],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: process.env,
      timeout: 180_000,
    },
  );
  matrixReport = loadMatrixFile();
  if (!matrixReport && child.status !== 0) {
    matrixReport = {
      overall: 'FAIL',
      gates: { SECURITY: 'FAIL', MFA: 'FAIL', RBAC: 'FAIL' },
      credentialedMatrixExecuted: false,
      notes: [`matrix_exit=${child.status}`, String(child.stderr || '').slice(0, 200)],
    };
  }
} else {
  // Reuse prior Pass-6 credentialed evidence when matrix re-run is skipped
  matrixReport = loadMatrixFile();
}

const hasCreds = Boolean(process.env.SMOKE_ADMIN_TOKEN || process.env.SMOKE_ADMIN_USER)
  || Boolean(matrixReport?.credentialedMatrixExecuted);

const gates = {
  AUTHENTICATION: {
    status: authPass && invalidPass ? 'PASS' : (checks.unauthenticated_admin_denied?.ok === false ? 'BLOCKED' : 'FAIL'),
    notes: 'Unauth + invalid bearer probes',
  },
  MFA: {
    status: matrixReport?.gates?.MFA || (hasCreds ? 'NOT_VERIFIED' : 'NOT_VERIFIED'),
    notes: matrixReport
      ? 'Credentialed Pass-6 MFA matrix executed'
      : 'Set SMOKE_* or run npm run security:pass6-matrix',
  },
  RBAC: {
    status: matrixReport?.gates?.RBAC || 'NOT_VERIFIED',
    notes: matrixReport
      ? 'Credentialed Pass-6 RBAC matrix executed'
      : 'Role matrix requires provisioned admin roles',
  },
  IDOR: {
    status: matrixReport?.gates?.IDOR || 'NOT_VERIFIED',
    notes: matrixReport ? 'Pass-6 IDOR probes executed' : 'IDOR matrix not executed',
  },
  JWT: {
    status: matrixReport?.gates?.JWT || 'NOT_VERIFIED',
    notes: matrixReport ? 'Pass-6 JWT/session probes executed' : 'JWT matrix not executed',
  },
  CSRF: {
    status: matrixReport?.gates?.CSRF || 'NOT_VERIFIED',
    notes: matrixReport ? 'Pass-6 CSRF probes executed' : 'Cookie CSRF matrix requires browser/session',
  },
  RATE_LIMIT: {
    status: matrixReport?.gates?.RATE_LIMIT || 'NOT_VERIFIED',
    notes: matrixReport ? 'Bounded auth rate-limit probes' : 'Not executed',
  },
  SECURITY: {
    status: matrixReport?.gates?.SECURITY
      || (authPass && readyPass ? 'NOT_VERIFIED' : 'FAIL'),
    notes: matrixReport
      ? 'Derived from Pass-6 credentialed matrix + public probes'
      : 'Partial automated surface only; full SECURITY PASS needs MFA+RBAC evidence',
  },
  AUDIT_LOGGING: {
    status: (() => {
      try {
        const p8 = path.resolve('docs/evidence/pass8/pass8_matrix_raw.json');
        if (fs.existsSync(p8)) {
          const body = JSON.parse(fs.readFileSync(p8, 'utf8'));
          const g = body?.gates?.AUDIT_MULTI_INSTANCE || body?.gates?.AUDIT_LOGGING;
          if (g) return g;
        }
        const p7 = path.resolve('docs/evidence/pass7/pass7_matrix_raw.json');
        if (fs.existsSync(p7)) {
          const body = JSON.parse(fs.readFileSync(p7, 'utf8'));
          return body?.gates?.AUDIT_LOGGING || 'NOT_VERIFIED';
        }
      } catch { /* ignore */ }
      return 'NOT_VERIFIED';
    })(),
    notes: 'Pass-8/7 audit matrix (append-only, durable, MFA/MC events) when evidence present',
  },
};

const { getConfigurationHealth } = await import('../lib/configHealthEngine.mjs');
const config = getConfigurationHealth();
const secretsLeak = JSON.stringify(config).match(/eyJ[A-Za-z0-9_-]+\.|postgres(ql)?:\/\/[^:]+:[^@]+@/i);

const resultStatus = (() => {
  const sec = gates.SECURITY.status;
  if (sec === 'FAIL' || gates.AUTHENTICATION.status === 'FAIL') return 'FAIL';
  if (sec === 'PASS') return 'PASS';
  if (sec === 'WARN') return 'WARN';
  if (sec === 'BLOCKED' || !matrixReport?.credentialedMatrixExecuted) return 'NOT_VERIFIED';
  return sec;
})();

const written = writePhase8Evidence('security', {
  environment,
  baseUrl,
  result: resultStatus,
  gates,
  cases,
  credentialedMatrixExecuted: Boolean(matrixReport?.credentialedMatrixExecuted),
  matrixOverall: matrixReport?.overall || null,
  configOverall: config.overall,
  secretsPrinted: false,
  secretsLeakDetected: Boolean(secretsLeak),
  notes: matrixReport
    ? 'Pass-6 credentialed MFA/RBAC/IDOR/JWT matrix executed against staging/local API.'
    : 'Automated partial certification. MFA/RBAC/CSRF remain NOT_VERIFIED until credentialed evidence.',
});

console.log(JSON.stringify({
  event: 'SECURITY_CERTIFICATION',
  environment,
  result: written.body.result,
  gates,
  credentialedMatrixExecuted: Boolean(matrixReport?.credentialedMatrixExecuted),
  path: written.relativePath,
  secretsPrinted: false,
}, null, 2));

const fail = gates.AUTHENTICATION.status === 'FAIL'
  || gates.SECURITY.status === 'FAIL'
  || gates.RBAC.status === 'FAIL'
  || gates.MFA.status === 'FAIL';
process.exit(fail ? 2 : 0);
