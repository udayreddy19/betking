#!/usr/bin/env node
/**
 * Read-only DB / migration verification + Phase 8 evidence.
 * NEVER applies migrations. Never prints secrets.
 */
import dotenv from 'dotenv';
dotenv.config();

import { REQUIRED_MIGRATIONS, checkMigrationsOnDiskAndDb } from '../lib/productionReadinessEngine.mjs';
import { writePhase8Evidence } from '../lib/certificationEvidence.mjs';

const environment = String(process.env.CERT_ENV || process.env.READINESS_ENV || 'local').toLowerCase();
const check = await checkMigrationsOnDiskAndDb();

let dbReachable = check.appliedCount != null;
let tablesOk = null;
try {
  const { query } = await import('../db/pg.js');
  const tables = await query(`
    SELECT COUNT(*)::int AS c FROM information_schema.tables
    WHERE table_schema='public' AND table_name = ANY($1::text[])
  `, [['wallets', 'ledger_entries', 'users', 'schema_migrations', 'reconciliation_cases']]);
  tablesOk = Number(tables.rows[0]?.c || 0) >= 4;
  dbReachable = true;
} catch {
  dbReachable = false;
  tablesOk = false;
}

const missing = check.missingMigrations || [];
let status = 'NOT_VERIFIED';
if (!dbReachable) status = environment === 'production' ? 'BLOCKED' : 'FAIL';
else if (check.status === 'RED' || missing.length) status = environment === 'production' ? 'NOT_VERIFIED' : 'FAIL';
else if (check.status === 'GREEN' && tablesOk) status = environment === 'local' ? 'PASS' : 'NOT_VERIFIED';
else status = 'NOT_VERIFIED';

// Never claim production PASS from local DB
if (environment === 'production') {
  status = 'NOT_VERIFIED';
}

const report = {
  event: 'DB_VERIFY',
  environment,
  expectedPrefixes: REQUIRED_MIGRATIONS,
  actualHead: check.actualHead || null,
  onDisk: check.onDisk,
  appliedStatus: check.appliedStatus,
  appliedCount: check.appliedCount,
  missingMigrations: missing,
  dbReachable,
  requiredTablesPresent: tablesOk,
  status,
  note: environment === 'production'
    ? 'Connected DATABASE_URL is not automatically treated as production — set CERT_ENV and verify against prod with explicit evidence'
    : check.note,
};

const written = writePhase8Evidence('database', {
  environment,
  result: status,
  gates: {
    DATABASE: { status: dbReachable ? (environment === 'production' ? 'NOT_VERIFIED' : (tablesOk ? 'PASS' : 'FAIL')) : 'BLOCKED' },
    MIGRATIONS: { status: environment === 'production' ? 'NOT_VERIFIED' : (missing.length ? 'FAIL' : (check.status === 'GREEN' ? 'PASS' : 'NOT_VERIFIED')) },
  },
  checks: report,
});

console.log(JSON.stringify({ ...report, evidencePath: written.relativePath }, null, 2));
process.exit(status === 'FAIL' || status === 'BLOCKED' ? 2 : 0);
