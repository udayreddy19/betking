#!/usr/bin/env node
/**
 * DR certification status runner.
 * Never claims PITR/RPO/RTO VERIFIED from a SQL dump restore alone.
 * Does not mutate production. Optional --class=LOCAL_DUMP only reports tooling.
 *
 * Usage:
 *   node scripts/dr-certification.mjs
 *   node scripts/dr-certification.mjs --class=LOCAL_DUMP
 *   node scripts/dr-certification.mjs --class=STAGING_PITR
 *   node scripts/dr-certification.mjs --class=PRODUCTION_CLASS_PITR
 */
import dotenv from 'dotenv';
dotenv.config();

function arg(name, fallback = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const klass = String(arg('class', 'STATUS')).toUpperCase();

const classes = {
  LOCAL_DUMP: {
    status: 'PASSED',
    evidence: 'docs/DR_RESTORE_TEST_CHECKLIST.md (isolated ~16.7s historical)',
    tooling: 'node scripts/dr_restore_isolated.mjs',
    note: 'LOCAL_DUMP ≠ production RTO/RPO/PITR',
    measuredRto: 'NOT VERIFIED (local only historical)',
    measuredRpo: 'NOT VERIFIED',
    pitr: 'NOT APPLICABLE',
  },
  STAGING_PITR: {
    status: 'NOT VERIFIED',
    evidence: null,
    tooling: 'Authorized staging WAL/PITR drill under change control',
    note: 'Must record restore_start, restore_finish, backup_timestamp, target_timestamp, WAL position',
    measuredRto: 'NOT VERIFIED',
    measuredRpo: 'NOT VERIFIED',
    pitr: 'NOT VERIFIED',
  },
  PRODUCTION_CLASS_PITR: {
    status: 'NOT VERIFIED',
    evidence: null,
    tooling: 'Production-equivalent authorized PITR (never destructive on live without change control)',
    note: 'Do not fabricate values',
    measuredRto: 'NOT VERIFIED',
    measuredRpo: 'NOT VERIFIED',
    pitr: 'NOT VERIFIED',
  },
};

const selected = klass === 'STATUS' ? null : classes[klass] || classes[klass.replace('_RESTORE', '')];

const report = {
  event: 'DR_CERTIFICATION',
  requestedClass: klass,
  classes: {
    LOCAL_DUMP_RESTORE: classes.LOCAL_DUMP,
    STAGING_PITR: classes.STAGING_PITR,
    PRODUCTION_CLASS_PITR: classes.PRODUCTION_CLASS_PITR,
  },
  selected: selected || {
    status: 'STATUS_ONLY',
    note: 'Pass --class=LOCAL_DUMP|STAGING_PITR|PRODUCTION_CLASS_PITR',
  },
  fieldsTemplate: {
    restore_start: null,
    restore_finish: null,
    RTO: 'NOT VERIFIED',
    backup_timestamp: null,
    target_timestamp: null,
    RPO: 'NOT VERIFIED',
    wal_position: null,
    migration_head: null,
    row_counts: null,
    integrity_results: null,
  },
  autoRepair: false,
  generatedAt: new Date().toISOString(),
};

if (selected && selected.status === 'NOT VERIFIED' && (klass.includes('PITR') || klass.includes('PRODUCTION'))) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(2);
}

console.log(JSON.stringify(report, null, 2));
process.exit(0);
