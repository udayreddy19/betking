#!/usr/bin/env node
/**
 * Isolated PostgreSQL disaster-recovery drill.
 * Restores the latest backups/*.sql into a SEPARATE database (never production).
 * Then runs migration head check + financial reconcile against the restore DB.
 *
 * Usage:
 *   node scripts/dr_restore_isolated.mjs
 * Env:
 *   DR_RESTORE_DB=oddsyra_dr_restore (default)
 *   DR_BACKUP_FILE=optional absolute path to .sql
 */
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const BACKUP_DIR = path.join(process.cwd(), 'backups');
const restoreDb = process.env.DR_RESTORE_DB || 'oddsyra_dr_restore';
const dbUser = process.env.POSTGRES_USER || 'oddsyra_app';
const dbHost = process.env.POSTGRES_HOST || '127.0.0.1';
const dbPort = process.env.POSTGRES_PORT || '5432';
const dbPass = process.env.POSTGRES_PASSWORD || 'oddsyra_dev_pass';
const adminDb = process.env.POSTGRES_ADMIN_DB || 'postgres';

function psql(args, opts = {}) {
  const env = { ...process.env, PGPASSWORD: dbPass };
  return execSync(`psql -h ${dbHost} -p ${dbPort} -U ${dbUser} ${args}`, {
    env,
    stdio: opts.stdio || 'pipe',
    encoding: 'utf8',
    input: opts.input,
    maxBuffer: 1024 * 1024 * 512,
  });
}

function pickBackup() {
  if (process.env.DR_BACKUP_FILE && fs.existsSync(process.env.DR_BACKUP_FILE)) {
    return process.env.DR_BACKUP_FILE;
  }
  if (!fs.existsSync(BACKUP_DIR)) throw new Error('backups/ missing');
  const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.sql')).sort().reverse();
  if (!files.length) throw new Error('No .sql backups in backups/');
  return path.join(BACKUP_DIR, files[0]);
}

async function main() {
  const backupFile = pickBackup();
  const sizeBytes = fs.statSync(backupFile).size;
  const report = {
    event: 'DR_RESTORE_ISOLATED',
    backupFile,
    sizeBytes,
    restoreDb,
    startedAt: new Date().toISOString(),
  };

  // Refuse restoring into the live app DB name
  const liveDb = process.env.POSTGRES_DB || 'oddsyra';
  if (restoreDb === liveDb) {
    throw new Error(`REFUSED: DR_RESTORE_DB must not equal live POSTGRES_DB (${liveDb})`);
  }

  console.log(JSON.stringify({ ...report, phase: 'START' }, null, 2));

  const tDrop = Date.now();
  psql(`-d ${adminDb} -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${restoreDb}' AND pid <> pg_backend_pid();"`);
  psql(`-d ${adminDb} -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${restoreDb};"`);
  psql(`-d ${adminDb} -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${restoreDb} OWNER ${dbUser};"`);
  report.prepareMs = Date.now() - tDrop;

  const tRestore = Date.now();
  // Stream file via psql -f (avoid loading entire dump into Node memory)
  const env = { ...process.env, PGPASSWORD: dbPass };
  execSync(
    `psql -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${restoreDb} -v ON_ERROR_STOP=1 -f "${backupFile}"`,
    { env, stdio: 'pipe', maxBuffer: 1024 * 1024 * 64 },
  );
  report.restoreMs = Date.now() - tRestore;
  report.restoreSuccess = true;

  const migCols = psql(
    `-d ${restoreDb} -t -A -c "SELECT column_name FROM information_schema.columns WHERE table_name='schema_migrations' ORDER BY 1;"`,
  )
    .trim()
    .split('\n')
    .filter(Boolean);
  report.schemaMigrationsColumns = migCols;
  let migrationHead = 'unknown';
  if (migCols.includes('version')) {
    migrationHead = psql(
      `-d ${restoreDb} -t -A -c "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1;"`,
    ).trim();
  } else if (migCols.includes('filename')) {
    migrationHead = psql(
      `-d ${restoreDb} -t -A -c "SELECT filename FROM schema_migrations ORDER BY filename DESC LIMIT 1;"`,
    ).trim();
  } else if (migCols.includes('id')) {
    migrationHead = psql(
      `-d ${restoreDb} -t -A -c "SELECT id::text FROM schema_migrations ORDER BY id DESC LIMIT 1;"`,
    ).trim();
  }
  report.migrationHead = migrationHead;

  // Wallet vs ledger spot check on restore DB
  const walletLedger = psql(`-d ${restoreDb} -t -A -c "
    SELECT COUNT(*)::int
    FROM wallets w
    LEFT JOIN (
      SELECT wallet_id, COALESCE(SUM(CASE WHEN type='CREDIT' THEN amount WHEN type='DEBIT' THEN -amount ELSE 0 END),0) AS ledger_sum
      FROM ledger_entries GROUP BY wallet_id
    ) l ON l.wallet_id = w.wallet_id
    WHERE ABS(COALESCE(w.balance,0) - COALESCE(l.ledger_sum,0)) > 0.01;
  "`).trim();
  report.walletLedgerMismatchCount = Number(walletLedger);

  const outbox = psql(`-d ${restoreDb} -t -A -c "SELECT COUNT(*)::int FROM outbox_events;"`).trim();
  report.outboxEventCount = Number(outbox);

  const bets = psql(`-d ${restoreDb} -t -A -c "SELECT COUNT(*)::int FROM bets;"`).trim();
  report.betCount = Number(bets);

  report.finishedAt = new Date().toISOString();
  report.status = report.walletLedgerMismatchCount === 0 ? 'PASS' : 'PASS_WITH_LEDGER_GAPS';
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ event: 'DR_RESTORE_ISOLATED', status: 'FAIL', error: err.message }));
  process.exit(1);
});
