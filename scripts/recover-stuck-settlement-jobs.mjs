#!/usr/bin/env node
/**
 * Admin-safe one-shot: requeue or fail-closed settlement_jobs stuck in PROCESSING > N hours.
 * Never deletes jobs.
 *
 * Usage:
 *   node scripts/recover-stuck-settlement-jobs.mjs              # apply (default 2h)
 *   node scripts/recover-stuck-settlement-jobs.mjs --dry-run    # report only
 *   node scripts/recover-stuck-settlement-jobs.mjs --hours=3 --limit=500
 */
import 'dotenv/config';
import { query } from '../db/pg.js';
import { recoverStuckProcessingSettlementJobs } from '../lib/settlement/settlementDeadLetterRecovery.mjs';

function arg(name, fallback = null) {
  const argv = process.argv;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === `--${name}`) {
      const next = argv[i + 1];
      if (next != null && !next.startsWith('--')) return next;
      return true;
    }
    if (a.startsWith(`--${name}=`)) return a.slice(name.length + 3);
  }
  return fallback;
}

async function main() {
  const dryRun = Boolean(arg('dry-run', false));
  const hours = Number(arg('hours', 2)) || 2;
  const limit = Number(arg('limit', 200)) || 200;

  const preview = await query(
    `SELECT job_id, bet_id, match_id, attempts, max_attempts, last_error,
            started_at, created_at,
            EXTRACT(EPOCH FROM (NOW() - COALESCE(started_at, created_at)))::int AS age_sec
     FROM settlement_jobs
     WHERE UPPER(status) = 'PROCESSING'
       AND COALESCE(started_at, created_at) < NOW() - ($1 || ' hours')::interval
     ORDER BY COALESCE(started_at, created_at) ASC
     LIMIT $2`,
    [String(hours), limit],
  );

  const report = {
    event: 'STUCK_SETTLEMENT_JOB_RECOVERY',
    dryRun,
    olderThanHours: hours,
    limit,
    candidates: preview.rows.length,
    jobs: preview.rows,
  };

  if (dryRun) {
    console.log(JSON.stringify({ ...report, applied: null }, null, 2));
    process.exit(0);
  }

  const applied = await recoverStuckProcessingSettlementJobs({
    olderThanHours: hours,
    limit,
  });
  console.log(JSON.stringify({ ...report, applied }, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(JSON.stringify({
    event: 'STUCK_SETTLEMENT_JOB_RECOVERY_ERROR',
    message: err.message,
  }));
  process.exit(1);
});
