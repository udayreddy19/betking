#!/usr/bin/env node
/**
 * Migration readiness — expected vs actual migration head.
 * Does not apply migrations. Never prints secrets.
 *
 * Usage: node scripts/migration-readiness.mjs
 */
import dotenv from 'dotenv';
dotenv.config();

import { REQUIRED_MIGRATIONS, checkMigrationsOnDiskAndDb } from '../lib/productionReadinessEngine.mjs';

const check = await checkMigrationsOnDiskAndDb();
const report = {
  event: 'MIGRATION_READINESS',
  expectedPrefixes: REQUIRED_MIGRATIONS,
  expectedHeadHint: '098_reconciliation_investigation_metadata.sql (or later)',
  actualHead: check.actualHead || null,
  onDisk: check.onDisk,
  appliedStatus: check.appliedStatus,
  appliedCount: check.appliedCount,
  missingMigrations: check.missingMigrations || Object.entries(check.appliedStatus || {})
    .filter(([, v]) => v === 'YELLOW')
    .map(([k]) => k),
  unexpectedMigrations: check.unexpectedMigrations || [],
  schemaWarnings: check.appliedCount == null
    ? ['schema_migrations not readable — NOT VERIFIED']
    : [],
  status: check.status,
  goLive: check.status === 'RED' || (check.status === 'YELLOW' && process.env.READINESS_ENV === 'production')
    ? 'NO-GO'
    : check.status === 'GREEN'
      ? 'OK_FOR_SOURCE'
      : 'HOLD',
  note: check.note,
  generatedAt: new Date().toISOString(),
};

console.log(JSON.stringify(report, null, 2));
process.exit(check.status === 'RED' ? 2 : 0);
