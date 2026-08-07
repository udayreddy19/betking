/**
 * Enterprise Scheduler Engine — BetKing Sportsbook (lib/scheduler.mjs)
 * Manages background cron jobs: market opening/closing, settlement jobs, leaderboard refreshes,
 * analytics processing, cache invalidations, provider syncs, and log archiving.
 */

const SCHEDULED_JOBS = new Map();

export function registerScheduledJob(jobId, cronExpression, jobTaskFn) {
  if (!jobId || typeof jobTaskFn !== 'function') {
    throw new Error('registerScheduledJob requires jobId and jobTaskFn');
  }

  const jobRecord = {
    jobId,
    cronExpression: cronExpression || '*/5 * * * * *',
    lastRunAt: null,
    status: 'ACTIVE',
    runCount: 0,
  };

  SCHEDULED_JOBS.set(jobId, jobRecord);
  return jobRecord;
}

export function triggerJobExecution(jobId) {
  const job = SCHEDULED_JOBS.get(jobId);
  if (!job) return false;

  job.lastRunAt = new Date().toISOString();
  job.runCount += 1;
  SCHEDULED_JOBS.set(jobId, job);
  return true;
}

export function getAllScheduledJobs() {
  return Array.from(SCHEDULED_JOBS.values());
}
