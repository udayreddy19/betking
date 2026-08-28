/**
 * Phase 8 certification evidence helpers.
 * Never prints secrets. Never mutates wallets/ledger.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PHASE8_EVIDENCE_DIR = path.join(ROOT, 'docs', 'evidence', 'phase8');
export const PHASE9_EVIDENCE_DIR = path.join(ROOT, 'docs', 'evidence', 'phase9');
export const PHASE10_EVIDENCE_DIR = path.join(ROOT, 'docs', 'evidence', 'phase10');
export const PHASE11_EVIDENCE_DIR = path.join(ROOT, 'docs', 'evidence', 'phase11');

export function ensurePhase8EvidenceDir() {
  fs.mkdirSync(PHASE8_EVIDENCE_DIR, { recursive: true });
  return PHASE8_EVIDENCE_DIR;
}

export function gitCommitSafe() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

/**
 * @param {string} name slug without extension
 * @param {object} payload
 */
export function writePhase8Evidence(name, payload) {
  ensurePhase8EvidenceDir();
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const file = `${name}_${ts}.json`;
  const full = path.join(PHASE8_EVIDENCE_DIR, file);
  const body = {
    phase: 8,
    timestamp: new Date().toISOString(),
    gitCommit: gitCommitSafe(),
    autoRepair: false,
    secretsPrinted: false,
    ...payload,
  };
  fs.writeFileSync(full, JSON.stringify(body, null, 2));
  const latest = path.join(PHASE8_EVIDENCE_DIR, `${name}_latest.json`);
  fs.writeFileSync(latest, JSON.stringify(body, null, 2));
  return { path: full, relativePath: path.relative(ROOT, full), latestRelative: path.relative(ROOT, latest), body };
}

export function readLatestEvidence(name) {
  const latest = path.join(PHASE8_EVIDENCE_DIR, `${name}_latest.json`);
  if (!fs.existsSync(latest)) return null;
  try {
    return JSON.parse(fs.readFileSync(latest, 'utf8'));
  } catch {
    return null;
  }
}

export function listPhase8EvidenceFiles() {
  ensurePhase8EvidenceDir();
  return fs.readdirSync(PHASE8_EVIDENCE_DIR).filter((f) => f.endsWith('.json'));
}

/** Map readiness status → certification status */
export function mapReadinessToCertStatus(status) {
  const s = String(status || '').toUpperCase().replace(/_/g, ' ');
  if (s === 'GREEN' || s === 'PASS' || s === 'OK') return 'PASS';
  if (s === 'RED' || s === 'FAIL' || s === 'CRITICAL') return 'FAIL';
  if (s === 'OUT OF SCOPE' || s === 'OUT_OF_SCOPE') return 'OUT_OF_SCOPE';
  if (s === 'BLOCKED') return 'BLOCKED';
  if (s === 'YELLOW') return 'NOT_VERIFIED';
  return 'NOT_VERIFIED';
}

/**
 * Production PASS only when evidence file says PASS for this gate+environment.
 * Missing evidence → NOT_VERIFIED (never inferred PASS).
 */
export function applyEvidenceOverride(gateName, environment, currentStatus, evidenceDoc) {
  if (!evidenceDoc) return { status: currentStatus, evidenceId: null, evidencePath: null, verified: false };
  const env = String(environment || '').toLowerCase();
  const docEnv = String(evidenceDoc.environment || '').toLowerCase();
  if (docEnv && docEnv !== env && docEnv !== 'any') {
    return { status: currentStatus, evidenceId: null, evidencePath: null, verified: false, notes: 'Evidence environment mismatch' };
  }
  const gateResult = evidenceDoc.gates?.[gateName]
    || evidenceDoc.checks?.[gateName]
    || evidenceDoc.result;
  if (!gateResult) {
    return { status: currentStatus, evidenceId: evidenceDoc.evidenceId || null, evidencePath: evidenceDoc._path || null, verified: false };
  }
  const st = typeof gateResult === 'string'
    ? mapReadinessToCertStatus(gateResult)
    : mapReadinessToCertStatus(gateResult.status || gateResult.result);
  // Never upgrade to PASS for production/staging without explicit PASS in evidence
  if (st === 'PASS' && (env === 'production' || env === 'staging')) {
    return {
      status: 'PASS',
      evidenceId: evidenceDoc.evidenceId || evidenceDoc.timestamp || null,
      evidencePath: evidenceDoc._path || null,
      verified: true,
      notes: evidenceDoc.notes || gateResult.notes || '',
    };
  }
  if (st === 'PASS' && env === 'local') {
    return {
      status: 'PASS',
      evidenceId: evidenceDoc.evidenceId || evidenceDoc.timestamp || null,
      evidencePath: evidenceDoc._path || null,
      verified: true,
    };
  }
  return {
    status: st === 'PASS' ? 'NOT_VERIFIED' : st,
    evidenceId: evidenceDoc.evidenceId || null,
    evidencePath: evidenceDoc._path || null,
    verified: false,
    notes: 'PASS not accepted without matching environment evidence',
  };
}


export function ensurePhase9EvidenceDir() {
  fs.mkdirSync(PHASE9_EVIDENCE_DIR, { recursive: true });
  return PHASE9_EVIDENCE_DIR;
}

/**
 * Write Phase 9 evidence (preferred over phase8 for go-live).
 * @param {string} name
 * @param {object} payload
 */
export function writePhase9Evidence(name, payload) {
  ensurePhase9EvidenceDir();
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const file = `${name}_${ts}.json`;
  const full = path.join(PHASE9_EVIDENCE_DIR, file);
  const body = {
    phase: 9,
    timestamp: new Date().toISOString(),
    gitCommit: gitCommitSafe(),
    autoRepair: false,
    secretsPrinted: false,
    ...payload,
  };
  // Strip accidental secrets
  const serialized = JSON.stringify(body, null, 2)
    .replace(/postgres(ql)?:\/\/[^\s"']+/gi, 'postgresql://[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]');
  fs.writeFileSync(full, serialized);
  const latest = path.join(PHASE9_EVIDENCE_DIR, `${name}_latest.json`);
  fs.writeFileSync(latest, serialized);
  // Also snake_case alias for report naming
  const snake = name.replace(/-/g, '_');
  if (snake !== name) {
    fs.writeFileSync(path.join(PHASE9_EVIDENCE_DIR, `${snake}_latest.json`), serialized);
  }
  return { path: full, relativePath: path.relative(ROOT, full), latestRelative: path.relative(ROOT, latest), body: JSON.parse(serialized) };
}

/** Prefer phase9 latest, else phase8. */
export function readLatestEvidencePreferPhase9(name) {
  const p9 = path.join(PHASE9_EVIDENCE_DIR, `${name}_latest.json`);
  if (fs.existsSync(p9)) {
    try {
      const doc = JSON.parse(fs.readFileSync(p9, 'utf8'));
      doc._phase = 9;
      return doc;
    } catch { /* fall through */ }
  }
  const doc = readLatestEvidence(name);
  if (doc) doc._phase = 8;
  return doc;
}

export function listPhase9EvidenceFiles() {
  ensurePhase9EvidenceDir();
  return fs.readdirSync(PHASE9_EVIDENCE_DIR).filter((f) => f.endsWith('.json'));
}

/**
 * Evidence may only upgrade a gate when environments match exactly.
 * local/staging evidence NEVER satisfies production.
 */
export function evidenceMatchesClaim(evidenceEnv, claimEnv) {
  const e = String(evidenceEnv || '').toLowerCase();
  const c = String(claimEnv || '').toLowerCase();
  if (!e || !c) return false;
  if (c === 'production') return e === 'production';
  if (c === 'staging') return e === 'staging';
  if (c === 'local') return e === 'local';
  return e === c;
}


export const DEFAULT_EVIDENCE_MAX_AGE_MS = Number(process.env.EVIDENCE_MAX_AGE_HOURS || 168) * 3600 * 1000;

export function ensurePhase10EvidenceDir() {
  fs.mkdirSync(PHASE10_EVIDENCE_DIR, { recursive: true });
  return PHASE10_EVIDENCE_DIR;
}

export function redactSecretsInJson(obj) {
  return JSON.stringify(obj, null, 2)
    .replace(/postgres(ql)?:\/\/[^\s"']+/gi, 'postgresql://[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/"JWT_SECRET"\s*:\s*"[^"]*"/gi, '"JWT_SECRET":"[REDACTED]"');
}

/**
 * Validate evidence document for a claim environment.
 * @returns {{ valid: boolean, reason?: string, statusHint?: string, expiresAt?: string|null, stale?: boolean }}
 */
export function validateEvidenceForClaim(doc, claimEnv, opts = {}) {
  const maxAgeMs = opts.maxAgeMs ?? DEFAULT_EVIDENCE_MAX_AGE_MS;
  if (!doc || typeof doc !== 'object') {
    return { valid: false, reason: 'missing_evidence', statusHint: 'NOT_VERIFIED' };
  }
  if (doc.blocked === true || String(doc.result || '').toUpperCase() === 'BLOCKED') {
    return {
      valid: false,
      reason: doc.blockReason || 'evidence_blocked',
      statusHint: 'BLOCKED',
      expiresAt: null,
    };
  }
  const env = String(doc.environment || '').toLowerCase();
  if (!env) {
    return { valid: false, reason: 'missing_environment', statusHint: 'NOT_VERIFIED' };
  }
  if (!evidenceMatchesClaim(env, claimEnv)) {
    return {
      valid: false,
      reason: `environment_mismatch:evidence=${env}:claim=${claimEnv}`,
      statusHint: 'NOT_VERIFIED',
    };
  }
  const ts = doc.timestamp || doc.evidenceTimestamp || doc.generatedAt;
  if (!ts) {
    return { valid: false, reason: 'missing_timestamp', statusHint: 'NOT_VERIFIED' };
  }
  const tMs = Date.parse(ts);
  if (!Number.isFinite(tMs)) {
    return { valid: false, reason: 'invalid_timestamp', statusHint: 'NOT_VERIFIED' };
  }
  const age = Date.now() - tMs;
  const expiresAt = new Date(tMs + maxAgeMs).toISOString();
  if (age > maxAgeMs) {
    return {
      valid: false,
      reason: 'stale_evidence',
      statusHint: 'NOT_VERIFIED',
      stale: true,
      expiresAt,
      evidenceTimestamp: new Date(tMs).toISOString(),
    };
  }
  if (doc.result == null && !doc.gates && !doc.checks) {
    return { valid: false, reason: 'malformed_missing_result_or_gates', statusHint: 'NOT_VERIFIED' };
  }
  // Stubs are never eligible to satisfy a production PASS claim
  const isStub = doc.stub === true
    || doc.verificationMethod === 'stub'
    || doc.verificationMethod === 'phase10_stub'
    || doc.verificationMethod === 'phase11_stub';
  if (isStub && String(claimEnv).toLowerCase() === 'production') {
    const mapped = String(doc.result || '').toUpperCase();
    if (mapped === 'PASS' || mapped === 'GREEN' || mapped === 'OK') {
      return {
        valid: false,
        reason: 'stub_cannot_pass_production',
        statusHint: 'NOT_VERIFIED',
        evidenceTimestamp: new Date(tMs).toISOString(),
        expiresAt,
      };
    }
  }
  return {
    valid: true,
    expiresAt,
    evidenceTimestamp: new Date(tMs).toISOString(),
    verificationMethod: doc.verificationMethod || 'file_evidence',
    verifiedBy: doc.verifiedBy || doc.operator || null,
    stub: isStub,
  };
}

export function writePhase10Evidence(name, payload) {
  ensurePhase10EvidenceDir();
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const body = {
    phase: 10,
    timestamp: new Date().toISOString(),
    gitCommit: gitCommitSafe(),
    autoRepair: false,
    forceGreenAllowed: false,
    secretsPrinted: false,
    ...payload,
  };
  if (body.expiresAt == null && body.timestamp) {
    const tMs = Date.parse(body.timestamp);
    if (Number.isFinite(tMs)) {
      body.expiresAt = new Date(tMs + DEFAULT_EVIDENCE_MAX_AGE_MS).toISOString();
    }
  }
  const serialized = redactSecretsInJson(body);
  const full = path.join(PHASE10_EVIDENCE_DIR, `${name}_${ts}.json`);
  fs.writeFileSync(full, serialized);
  const latest = path.join(PHASE10_EVIDENCE_DIR, `${name}_latest.json`);
  fs.writeFileSync(latest, serialized);
  const snake = name.replace(/-/g, '_');
  if (snake !== name) {
    fs.writeFileSync(path.join(PHASE10_EVIDENCE_DIR, `${snake}_latest.json`), serialized);
  }
  // Retain historical — do not delete timestamped files
  return {
    path: full,
    relativePath: path.relative(ROOT, full),
    latestRelative: path.relative(ROOT, latest),
    body: JSON.parse(serialized),
  };
}

/** Prefer phase10 → phase9 → phase8; non-stub evidence preferred over stubs. */
export function readLatestEvidencePreferPhase10(name) {
  const candidates = [];
  const p10 = path.join(PHASE10_EVIDENCE_DIR, `${name}_latest.json`);
  if (fs.existsSync(p10)) {
    try {
      const doc = JSON.parse(fs.readFileSync(p10, 'utf8'));
      doc._phase = 10;
      candidates.push(doc);
    } catch { /* ignore */ }
  }
  const p9doc = readLatestEvidencePreferPhase9(name);
  if (p9doc) candidates.push(p9doc);

  const nonStub = candidates.find((d) => d && d.stub !== true && d.verificationMethod !== 'stub');
  if (nonStub) return nonStub;
  return candidates[0] || null;
}

export function listPhase10EvidenceFiles() {
  ensurePhase10EvidenceDir();
  return fs.readdirSync(PHASE10_EVIDENCE_DIR).filter((f) => f.endsWith('.json'));
}

export function ensurePhase11EvidenceDir() {
  fs.mkdirSync(PHASE11_EVIDENCE_DIR, { recursive: true });
  return PHASE11_EVIDENCE_DIR;
}

export function writePhase11Evidence(name, payload) {
  ensurePhase11EvidenceDir();
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const body = {
    phase: 11,
    timestamp: new Date().toISOString(),
    gitCommit: gitCommitSafe(),
    autoRepair: false,
    forceGreenAllowed: false,
    secretsPrinted: false,
    ...payload,
  };
  if (body.expiresAt == null && body.timestamp) {
    const tMs = Date.parse(body.timestamp);
    if (Number.isFinite(tMs)) {
      body.expiresAt = new Date(tMs + DEFAULT_EVIDENCE_MAX_AGE_MS).toISOString();
    }
  }
  const serialized = redactSecretsInJson(body);
  const full = path.join(PHASE11_EVIDENCE_DIR, `${name}_${ts}.json`);
  fs.writeFileSync(full, serialized);
  const latest = path.join(PHASE11_EVIDENCE_DIR, `${name}_latest.json`);
  fs.writeFileSync(latest, serialized);
  const snake = name.replace(/-/g, '_');
  if (snake !== name) {
    fs.writeFileSync(path.join(PHASE11_EVIDENCE_DIR, `${snake}_latest.json`), serialized);
  }
  return {
    path: full,
    relativePath: path.relative(ROOT, full),
    latestRelative: path.relative(ROOT, latest),
    body: JSON.parse(serialized),
  };
}

/**
 * Prefer phase11 always when present (newer evidence wins even if NOT_VERIFIED).
 * Fall back to phase10→9→8 only when phase11 is absent.
 * Non-stub preferred among fallbacks.
 */
export function readLatestEvidencePreferPhase11(name) {
  const p11 = path.join(PHASE11_EVIDENCE_DIR, `${name}_latest.json`);
  if (fs.existsSync(p11)) {
    try {
      const doc = JSON.parse(fs.readFileSync(p11, 'utf8'));
      doc._phase = 11;
      doc._evidenceSource = `phase11/${name}_latest.json`;
      return doc;
    } catch { /* fall through */ }
  }
  const older = readLatestEvidencePreferPhase10(name);
  if (older && !older._evidenceSource) {
    older._evidenceSource = `phase${older._phase || '?'}/${name}_latest.json`;
  }
  return older;
}

export function listPhase11EvidenceFiles() {
  ensurePhase11EvidenceDir();
  return fs.readdirSync(PHASE11_EVIDENCE_DIR).filter((f) => f.endsWith('.json'));
}

/** Safe redacted DB identity — never include passwords or full URLs. */
export function redactDatabaseIdentity(databaseUrl) {
  if (!databaseUrl || typeof databaseUrl !== 'string') {
    return { host: null, database: null, port: null, user: null, identityProven: false };
  }
  try {
    const u = new URL(databaseUrl.replace(/^postgresql:/i, 'postgres:'));
    const host = u.hostname || null;
    const database = (u.pathname || '').replace(/^\//, '') || null;
    const port = u.port || null;
    const user = u.username ? `${String(u.username).slice(0, 2)}***` : null;
    return {
      host: host ? `${String(host).slice(0, 3)}***` : null,
      database: database ? `${String(database).slice(0, 3)}***` : null,
      port,
      user,
      identityProven: false,
      note: 'Redacted; identityProven remains false until operator asserts production under change control',
    };
  } catch {
    return { host: null, database: null, port: null, user: null, identityProven: false };
  }
}

