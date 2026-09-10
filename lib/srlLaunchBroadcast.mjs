/**
 * OddsYra SRL launch announcement — email + in-app to all eligible users.
 * Resumable batches; respects marketing_email opt-out for EMAIL channel.
 */

import { query } from '../db/pg.js';
import { canSendPromotionalEmail } from './notificationPreferencesEngine.mjs';
import { dispatchNotificationEvent } from './notificationEngine.mjs';
import { sendPromotionalCampaignEmail } from '../server/auth/emailService.js';
import { loadSrlOperatorSettingJson, saveSrlOperatorSettingJson } from './iplSrlOperatorState.mjs';

export const SRL_LAUNCH_EMAIL_SUBJECT = 'OddsYra SRL starts today — live simulated IPL action';

export const SRL_LAUNCH_EMAIL_BODY = [
  'OddsYra SRL is live from today.',
  '',
  'Bet on our in-house simulated IPL league — toss, live overs, and full match markets — right inside Sports and the OddsYra SRL board.',
  '',
  'Open Sports, find OddsYra SRL fixtures, and place your first bets.',
  '',
  'Play responsibly. 18+ only.',
].join('\n');

export const SRL_LAUNCH_IN_APP_TITLE = 'OddsYra SRL starts today';
export const SRL_LAUNCH_IN_APP_MESSAGE =
  'OddsYra SRL is live from today — simulated IPL markets are open on Sports. Toss, live overs, and match betting await.';

const JOB_KEY = 'srl_launch_broadcast_job';
const FRONTEND_URL = process.env.FRONTEND_URL || process.env.APP_URL || 'https://oddsyra.com';

function defaultJob() {
  return {
    id: `srl_launch_${Date.now()}`,
    status: 'idle',
    createdAt: null,
    updatedAt: null,
    cursor: null,
    totals: {
      users: 0,
      emailSent: 0,
      emailSkipped: 0,
      emailFailed: 0,
      inAppSent: 0,
      inAppSkipped: 0,
      inAppFailed: 0,
    },
    lastError: null,
    dryRun: false,
  };
}

export async function getSrlLaunchBroadcastJob() {
  const stored = await loadSrlOperatorSettingJson(JOB_KEY, null);
  return stored && typeof stored === 'object' ? { ...defaultJob(), ...stored } : defaultJob();
}

async function saveJob(job) {
  const next = { ...job, updatedAt: Date.now() };
  await saveSrlOperatorSettingJson(JOB_KEY, next);
  return next;
}

/**
 * Start (or reset) the SRL launch campaign.
 * @param {{ dryRun?: boolean, reset?: boolean, admin?: string }} opts
 */
export async function startSrlLaunchBroadcast({ dryRun = false, reset = false, admin = 'admin' } = {}) {
  let job = await getSrlLaunchBroadcastJob();
  if (job.status === 'running' && !reset) {
    return { success: true, alreadyRunning: true, job };
  }
  if (reset || job.status === 'idle' || job.status === 'completed' || job.status === 'failed') {
    const countRes = await query(
      `SELECT COUNT(*)::int AS n
       FROM users
       WHERE email IS NOT NULL AND TRIM(email) <> ''`,
    );
    job = {
      ...defaultJob(),
      id: `srl_launch_${Date.now()}`,
      status: dryRun ? 'dry_run' : 'running',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      cursor: null,
      dryRun: !!dryRun,
      startedBy: admin,
      totals: {
        ...defaultJob().totals,
        users: Number(countRes.rows[0]?.n) || 0,
      },
    };
    await saveJob(job);
  }
  return { success: true, job };
}

/**
 * Process one batch of users (email + in-app).
 * @param {{ batchSize?: number, includeEmail?: boolean, includeInApp?: boolean }} opts
 */
export async function processSrlLaunchBroadcastBatch({
  batchSize = 40,
  includeEmail = true,
  includeInApp = true,
} = {}) {
  let job = await getSrlLaunchBroadcastJob();
  if (job.status !== 'running' && job.status !== 'dry_run') {
    return { success: false, reason: 'not_running', job };
  }

  const limit = Math.max(1, Math.min(200, Number(batchSize) || 40));
  const params = [];
  let sql = `
    SELECT user_id, email, split_part(email, '@', 1) AS name
    FROM users
    WHERE email IS NOT NULL AND TRIM(email) <> ''
  `;
  if (job.cursor) {
    params.push(job.cursor);
    sql += ` AND user_id > $1`;
  }
  sql += ` ORDER BY user_id ASC LIMIT $${params.length + 1}`;
  params.push(limit);
  const usersRes = await query(sql, params);

  const rows = usersRes.rows || [];
  if (!rows.length) {
    job.status = 'completed';
    job = await saveJob(job);
    return { success: true, done: true, processed: 0, job };
  }

  const eventBase = job.id;
  for (const row of rows) {
    const userId = row.user_id;
    const email = String(row.email || '').trim();
    const name = row.name || email.split('@')[0];

    if (includeInApp) {
      try {
        if (!job.dryRun) {
          const r = await dispatchNotificationEvent({
            eventId: `${eventBase}_app_${userId}`,
            eventType: 'ADMIN_BROADCAST',
            userId,
            category: 'PROMOTIONAL',
            channel: 'IN_APP',
            data: {
              title: SRL_LAUNCH_IN_APP_TITLE,
              message: SRL_LAUNCH_IN_APP_MESSAGE,
              subject: SRL_LAUNCH_IN_APP_TITLE,
              body: SRL_LAUNCH_IN_APP_MESSAGE,
            },
          });
          if (r?.skipped) job.totals.inAppSkipped += 1;
          else job.totals.inAppSent += 1;
        } else {
          job.totals.inAppSent += 1;
        }
      } catch {
        job.totals.inAppFailed += 1;
      }
    }

    if (includeEmail && email) {
      try {
        const allow = await canSendPromotionalEmail(userId);
        if (!allow) {
          job.totals.emailSkipped += 1;
        } else if (job.dryRun) {
          job.totals.emailSent += 1;
        } else {
          const result = await sendPromotionalCampaignEmail({
            email,
            name,
            title: SRL_LAUNCH_EMAIL_SUBJECT,
            offerBody: SRL_LAUNCH_EMAIL_BODY,
            ctaLabel: 'Open OddsYra SRL',
            ctaUrl: `${FRONTEND_URL}/srl`,
          });
          if (result?.success === false) {
            job.totals.emailFailed += 1;
            job.lastError = result.error || 'send_failed';
            // Stop batch early on SMTP quota so we can resume later.
            if (/quota|rate|limit|daily/i.test(String(result.error || ''))) {
              job.cursor = userId;
              job.status = 'paused_quota';
              job = await saveJob(job);
              return {
                success: true,
                paused: true,
                reason: 'quota',
                processed: rows.indexOf(row) + 1,
                job,
              };
            }
          } else {
            job.totals.emailSent += 1;
          }
        }
      } catch (err) {
        job.totals.emailFailed += 1;
        job.lastError = err.message;
        if (/quota|rate|limit|daily/i.test(err.message || '')) {
          job.cursor = userId;
          job.status = 'paused_quota';
          job = await saveJob(job);
          return { success: true, paused: true, reason: 'quota', processed: rows.indexOf(row) + 1, job };
        }
      }
    }

    job.cursor = userId;
  }

  job = await saveJob(job);
  return {
    success: true,
    done: false,
    processed: rows.length,
    job,
  };
}

/**
 * Drain batches until complete, paused, or maxBatches reached.
 */
export async function runSrlLaunchBroadcast({
  maxBatches = 25,
  batchSize = 40,
  includeEmail = true,
  includeInApp = true,
  delayMs = 150,
} = {}) {
  const results = [];
  for (let i = 0; i < maxBatches; i += 1) {
    const res = await processSrlLaunchBroadcastBatch({ batchSize, includeEmail, includeInApp });
    results.push(res);
    if (res.done || res.paused || res.reason === 'not_running') break;
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }
  const job = await getSrlLaunchBroadcastJob();
  return { success: true, batches: results.length, job, results };
}

/** Resume after quota pause. */
export async function resumeSrlLaunchBroadcast(admin = 'admin') {
  const job = await getSrlLaunchBroadcastJob();
  if (job.status !== 'paused_quota' && job.status !== 'running') {
    return startSrlLaunchBroadcast({ reset: false, admin });
  }
  job.status = 'running';
  job.lastError = null;
  await saveJob(job);
  return { success: true, job };
}
