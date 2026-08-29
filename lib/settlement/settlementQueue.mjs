/**
 * Durable settlement job queue — crash-safe, idempotent, FOR UPDATE SKIP LOCKED.
 */

import { query, withTransaction } from '../../db/pg.js';
import { betSettlementEngine } from '../betSettlementEngine.mjs';
import { buildSettlementMatchState } from '../liveMatchSettlement.mjs';
import { matchIdAliases } from '../matchIdPublic.mjs';
import { logSettlement } from './settlementAudit.mjs';
import { retryDelayMs } from './settlementDeadLetterRecovery.mjs';
import { evaluateSettlementConfidence } from './settlementConfidenceEngine.mjs';
import { authorizeSettlement } from './settlementAuthorizationEngine.mjs';

let ensured = false;

async function ensureSettlementJobsTable() {
  if (ensured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS settlement_jobs (
      job_id VARCHAR(128) PRIMARY KEY,
      bet_id VARCHAR(128) NOT NULL,
      match_id VARCHAR(128) NOT NULL,
      market_id VARCHAR(256),
      market_instance_key VARCHAR(256),
      trigger_event_id VARCHAR(128),
      status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
      attempts INT NOT NULL DEFAULT 0,
      max_attempts INT NOT NULL DEFAULT 5,
      last_error TEXT,
      scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  ensured = true;
}

export async function enqueueSettlementJob({
  betId,
  matchId,
  marketId = null,
  marketInstanceKey = null,
  triggerEventId = null,
  delayMs = 0,
}) {
  await ensureSettlementJobsTable();
  const jobId = `sj_${betId}_${triggerEventId || 'manual'}_${Date.now()}`;
  const scheduledAt = new Date(Date.now() + delayMs).toISOString();

  try {
    await query(
      `INSERT INTO settlement_jobs
         (job_id, bet_id, match_id, market_id, market_instance_key, trigger_event_id, status, scheduled_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7)`,
      [jobId, betId, matchId, marketId, marketInstanceKey, triggerEventId, scheduledAt],
    );
  } catch {
    // Duplicate bet+trigger — idempotent enqueue
  }

  return jobId;
}

/** Enqueue all open bets for a market instance after an event boundary. */
export async function enqueueBetsForMarketInstance({
  matchId,
  marketInstanceKey,
  triggerEventId,
  marketIdPattern = null,
}) {
  await ensureSettlementJobsTable();
  const aliasIds = [...new Set([String(matchId || ''), ...matchIdAliases(matchId)].filter(Boolean))];
  let enqueued = 0;

  for (const mid of aliasIds) {
    const params = [mid];
    let sql = `
    SELECT bet_id, market_id FROM bets
    WHERE match_id = $1 AND UPPER(status) IN ('ACCEPTED', 'PENDING', 'OPEN')
  `;
    if (marketIdPattern) {
      params.push(marketIdPattern);
      sql += ` AND market_id ILIKE $${params.length}`;
    }

    const res = await query(sql, params);
    for (const row of res.rows) {
      await enqueueSettlementJob({
        betId: row.bet_id,
        matchId: mid,
        marketId: row.market_id,
        marketInstanceKey,
        triggerEventId: `${triggerEventId}_${row.bet_id}`,
      });
      enqueued += 1;
    }
  }
  return enqueued;
}

export async function processSettlementQueue({ limit = 50, matchLookup = null } = {}) {
  await ensureSettlementJobsTable();

  const claimed = await withTransaction(async (client) => {
    const jobsRes = await client.query(
      `SELECT job_id, bet_id, match_id, market_id, attempts, max_attempts
       FROM settlement_jobs
       WHERE status IN ('PENDING', 'RETRY', 'AWAITING_EVIDENCE') AND scheduled_at <= NOW()
       ORDER BY scheduled_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [limit],
    );

    const ids = jobsRes.rows.map((r) => r.job_id);
    if (!ids.length) return [];

    await client.query(
      `UPDATE settlement_jobs
       SET status = 'PROCESSING', started_at = NOW(), attempts = attempts + 1
       WHERE job_id = ANY($1::varchar[])`,
      [ids],
    );
    return jobsRes.rows;
  });

  if (!claimed.length) {
    return { processed: 0, settled: 0, failed: 0, skipped: 0 };
  }

  let settled = 0;
  let failed = 0;
  let skipped = 0;

  for (const job of claimed) {
    try {
      const betRes = await query('SELECT * FROM bets WHERE bet_id = $1', [job.bet_id]);
      const bet = betRes.rows[0];
      if (!bet) {
        await markJob(job.job_id, 'FAILED', 'bet_not_found');
        failed += 1;
        continue;
      }

      const prior = String(bet.status || '').toUpperCase();
      if (['WON', 'LOST', 'VOID', 'CASHED_OUT', 'REFUNDED'].includes(prior)) {
        await markJob(job.job_id, 'COMPLETED', null);
        logSettlement('SETTLEMENT_ALREADY_PROCESSED', { betId: job.bet_id, jobId: job.job_id });
        skipped += 1;
        continue;
      }

      let evaluated = null;
      if (matchLookup) {
        const { evaluateBetForSettlement } = await import('../liveMatchSettlement.mjs');
        evaluated = await evaluateBetForSettlement(bet, matchLookup);
      }

      if (!evaluated) {
        await markJob(job.job_id, 'AWAITING_EVIDENCE', 'not_eligible_yet', (job.attempts || 0) + 1, job.max_attempts);
        skipped += 1;
        continue;
      }

      const targetMatch = matchLookup?.(job.match_id) || { id: job.match_id };
      const authResult = authorizeSettlement({
        bet,
        match: targetMatch,
        marketContext: { marketId: bet.market_id, boundaryReached: Boolean(evaluated) },
        providerObservations: targetMatch.providerObservations || [],
        evaluatedOutcome: evaluated.outcome,
        authorizedBy: 'SettlementJobQueue',
      });

      if (!authResult.success) {
        await markJob(job.job_id, 'AWAITING_EVIDENCE', authResult.error || 'confidence_blocked', (job.attempts || 0) + 1, job.max_attempts);
        skipped += 1;
        continue;
      }

      logSettlement('SETTLEMENT_STARTED', { betId: job.bet_id, outcome: evaluated.outcome, authorizationId: authResult.authorization?.authorizationId });

      const matchState = buildSettlementMatchState(targetMatch);
      const res = await betSettlementEngine.settleSingleBet({
        betId: job.bet_id,
        matchState: {
          ...matchState,
          matchId: job.match_id,
          status: 'COMPLETED',
          __forcedOutcome: evaluated.outcome,
          __settlementReason: evaluated.reason,
          __legOutcomes: evaluated.legOutcomes,
          __settlementRule: evaluated.rule || null,
        },
        authorization: authResult.authorization,
      });

      if (res?.status === 'SETTLED' || res?.status === 'ALREADY_SETTLED') {
        await markJob(job.job_id, 'COMPLETED', null);
        settled += 1;
      } else {
        await markJob(job.job_id, 'RETRY', 'settlement_skipped', job.attempts + 1, job.max_attempts);
        skipped += 1;
      }
    } catch (err) {
      logSettlement('SETTLEMENT_FAILED', { betId: job.bet_id, error: err.message });
      await markJob(job.job_id, 'RETRY', err.message, job.attempts + 1, job.max_attempts);
      failed += 1;
    }
  }

  return { processed: claimed.length, settled, failed, skipped };
}

async function markJob(jobId, status, error, attempts = 0, maxAttempts = 5) {
  if (status === 'RETRY' || status === 'AWAITING_EVIDENCE') {
    if (attempts >= maxAttempts) {
      status = 'DEAD_LETTER';
      await query(
        `INSERT INTO reconciliation_cases (id, reconciliation_type, entity_type, entity_id, severity, status, notes)
         VALUES ($1, 'SETTLEMENT_FAILED', 'settlement_job', $2, 'HIGH', 'OPEN', $3)
         ON CONFLICT DO NOTHING`,
        [`case_sj_${jobId}`, jobId, error || 'max attempts exceeded'],
      );
      // Fail-safe ops alert — never blocks settlement path
      import('../opsAlertEngine.mjs')
        .then(({ raiseOpsAlert }) => raiseOpsAlert({
          title: 'Settlement job dead-lettered',
          message: error || 'max attempts exceeded',
          severity: 'CRITICAL',
          category: 'BETTING',
          source: 'settlementQueue',
          entityType: 'settlement_job',
          entityId: jobId,
          dedupeKey: `settlement_dead:${jobId}`,
          soft: true,
        }))
        .catch(() => null);
    } else {
      const delayMs = retryDelayMs(attempts);
      const scheduledAt = new Date(Date.now() + delayMs).toISOString();
      await query(
        `UPDATE settlement_jobs
         SET status = $1, last_error = $2, attempts = $3, scheduled_at = $4::timestamptz, started_at = NULL
         WHERE job_id = $5`,
        [status, error, attempts, scheduledAt, jobId],
      );
      return;
    }
  }

  await query(
    `UPDATE settlement_jobs
     SET status = $1, last_error = $2, attempts = $3,
         completed_at = CASE WHEN $1 IN ('COMPLETED', 'FAILED', 'DEAD_LETTER') THEN NOW() ELSE completed_at END
     WHERE job_id = $4`,
    [status, error, attempts, jobId],
  );
}

export async function getPendingSettlementJobs(limit = 100) {
  await ensureSettlementJobsTable();
  const res = await query(
    `SELECT * FROM settlement_jobs
     WHERE status IN ('PENDING', 'RETRY', 'AWAITING_EVIDENCE', 'PROCESSING')
     ORDER BY scheduled_at ASC LIMIT $1`,
    [limit],
  );
  return res.rows;
}

export async function getFailedSettlementJobs(limit = 100) {
  await ensureSettlementJobsTable();
  const res = await query(
    `SELECT * FROM settlement_jobs
     WHERE status IN ('FAILED', 'DEAD_LETTER')
     ORDER BY completed_at DESC NULLS LAST LIMIT $1`,
    [limit],
  );
  return res.rows;
}

export async function retrySettlementJob(jobId) {
  await ensureSettlementJobsTable();
  const res = await query(
    `UPDATE settlement_jobs
     SET status = 'PENDING', scheduled_at = NOW(), last_error = NULL, attempts = 0
     WHERE job_id = $1 AND status IN ('FAILED', 'DEAD_LETTER', 'RETRY')
     RETURNING job_id`,
    [jobId],
  );
  return res.rows[0] || null;
}
