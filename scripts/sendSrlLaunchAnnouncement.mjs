#!/usr/bin/env node
/**
 * Send OddsYra SRL launch announcement (email + in-app) to all users.
 *
 * Usage:
 *   node scripts/sendSrlLaunchAnnouncement.mjs --dry-run
 *   node scripts/sendSrlLaunchAnnouncement.mjs --batches=50 --batch-size=40
 *   node scripts/sendSrlLaunchAnnouncement.mjs --resume
 *   node scripts/sendSrlLaunchAnnouncement.mjs --in-app-only
 *   node scripts/sendSrlLaunchAnnouncement.mjs --email-only
 */
import 'dotenv/config';
import {
  startSrlLaunchBroadcast,
  runSrlLaunchBroadcast,
  resumeSrlLaunchBroadcast,
  getSrlLaunchBroadcastJob,
  SRL_LAUNCH_EMAIL_SUBJECT,
} from '../lib/srlLaunchBroadcast.mjs';

function arg(name, fallback = null) {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  if (hit.includes('=')) return hit.split('=').slice(1).join('=');
  return true;
}

const dryRun = Boolean(arg('dry-run'));
const resume = Boolean(arg('resume'));
const inAppOnly = Boolean(arg('in-app-only'));
const emailOnly = Boolean(arg('email-only'));
const maxBatches = Number(arg('batches', 30)) || 30;
const batchSize = Number(arg('batch-size', 40)) || 40;

console.log('OddsYra SRL launch broadcast');
console.log('Subject:', SRL_LAUNCH_EMAIL_SUBJECT);
console.log({ dryRun, resume, inAppOnly, emailOnly, maxBatches, batchSize });

if (resume) {
  await resumeSrlLaunchBroadcast('script');
} else {
  await startSrlLaunchBroadcast({ dryRun, reset: true, admin: 'script' });
}

const result = await runSrlLaunchBroadcast({
  maxBatches,
  batchSize,
  includeEmail: !inAppOnly,
  includeInApp: !emailOnly,
  delayMs: dryRun ? 0 : 120,
});

const job = result.job || (await getSrlLaunchBroadcastJob());
console.log(JSON.stringify({
  status: job.status,
  totals: job.totals,
  cursor: job.cursor,
  lastError: job.lastError,
  batchesRun: result.batches,
}, null, 2));

if (job.status === 'paused_quota') {
  console.log('Paused on SMTP quota/rate limit — re-run with --resume later.');
  process.exit(2);
}
if (job.status === 'completed') {
  console.log('All eligible users processed.');
  process.exit(0);
}
console.log('Partial run complete — re-run the same command (or --resume) to continue.');
process.exit(0);
