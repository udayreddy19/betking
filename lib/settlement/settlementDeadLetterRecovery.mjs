/**
 * Recover settlement jobs that exhausted retries — worker failure must not orphan bets.
 */

import { query } from '../../db/pg.js';
import { betSettlementEngine } from '../betSettlementEngine.mjs';
import { buildSettlementMatchState, settleOpenBetsFromLiveScores } from '../liveMatchSettlement.mjs';
import { matchIdAliases } from '../matchIdPublic.mjs';
import { enrichMatchWithCanonicalState } from './settlementCanonicalState.mjs';
import { logSettlement } from './settlementAudit.mjs';
import { authorizeSettlement } from './settlementAuthorizationEngine.mjs';

const BACKOFF_BASE_MS = 2000;
const BACKOFF_CAP_MS = 300000;
const DEAD_LETTER_REQUEUE_MS = 60000;

export function retryDelayMs(attempts) {
  return Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * (2 ** Math.max(0, attempts - 1)));
}

async function hydrateMatchForJob(matchId) {
  const id = String(matchId || '');
  if (!id) return null;

  let detail = null;
  if (/^(oy_|10cric_)/i.test(id)) {
    const { fetch10CricMatchById } = await import('../providers/tencricProvider.mjs');
    detail = await fetch10CricMatchById(id);
  }
  if (!detail) {
    const { fetchMatchDetail } = await import('../matchDetailFetcher.mjs');
    detail = await fetchMatchDetail({
      id,
      matchId: id,
      sport: 'cricket',
      source: /^(oy_|10cric_)/i.test(id) ? '10cric' : undefined,
    }, { fast: false }).catch(() => null);
  }
  return detail ? enrichMatchWithCanonicalState(detail) : null;
}

async function buildMatchLookupForJobs(jobs) {
  const byId = new Map();
  const matchIds = [...new Set(jobs.map((j) => String(j.match_id || '')).filter(Boolean))];
  for (const matchId of matchIds) {
    const enriched = await hydrateMatchForJob(matchId);
    if (!enriched) continue;
    for (const alias of [matchId, enriched.id, enriched.matchId, ...matchIdAliases(matchId)]) {
      if (alias) byId.set(String(alias), enriched);
    }
  }
  return (id) => byId.get(String(id)) || null;
}

/**
 * Requeue or fail-closed settlement jobs stuck in PROCESSING (worker crash / hang).
 * Age is measured from started_at (claim time), falling back to created_at.
 * Does not delete jobs.
 */
export async function recoverStuckProcessingSettlementJobs({
  olderThanHours = 2,
  limit = 200,
} = {}) {
  const hours = Math.max(1, Number(olderThanHours) || 2);
  const cap = Math.min(Math.max(1, Number(limit) || 200), 1000);

  // Prefer requeue while attempts remain; fail-closed at max_attempts so ops can see last_error.
  const res = await query(
    `UPDATE settlement_jobs j
     SET status = CASE
           WHEN j.attempts >= j.max_attempts THEN 'FAILED'
           ELSE 'PENDING'
         END,
         last_error = CASE
           WHEN j.attempts >= j.max_attempts
             THEN 'stuck_processing_timeout: PROCESSING >' || $1 || 'h; marked FAILED (max attempts exceeded)'
           ELSE 'stuck_processing_timeout: PROCESSING >' || $1 || 'h; requeued to PENDING'
         END,
         started_at = NULL,
         scheduled_at = CASE
           WHEN j.attempts >= j.max_attempts THEN j.scheduled_at
           ELSE NOW()
         END,
         completed_at = CASE
           WHEN j.attempts >= j.max_attempts THEN NOW()
           ELSE j.completed_at
         END
     WHERE j.job_id IN (
       SELECT job_id
       FROM settlement_jobs
       WHERE UPPER(status) = 'PROCESSING'
         AND COALESCE(started_at, created_at) < NOW() - ($1 || ' hours')::interval
       ORDER BY COALESCE(started_at, created_at) ASC
       LIMIT $2
     )
     RETURNING j.job_id, j.status, j.last_error, j.bet_id, j.attempts, j.max_attempts`,
    [String(hours), cap],
  );

  let requeued = 0;
  let failed = 0;
  for (const row of res.rows) {
    if (row.status === 'FAILED') {
      failed += 1;
      logSettlement('STUCK_PROCESSING_FAILED', {
        jobId: row.job_id,
        betId: row.bet_id,
        attempts: row.attempts,
        maxAttempts: row.max_attempts,
        error: row.last_error,
      });
    } else {
      requeued += 1;
      logSettlement('STUCK_PROCESSING_REQUEUED', {
        jobId: row.job_id,
        betId: row.bet_id,
        attempts: row.attempts,
        error: row.last_error,
      });
    }
  }

  return {
    scanned: res.rows.length,
    requeued,
    failed,
    olderThanHours: hours,
  };
}

/** Re-process DEAD_LETTER / AWAITING_EVIDENCE jobs with full match hydration. */
export async function recoverDeadLetterSettlementJobs({ limit = 30 } = {}) {
  const res = await query(
    `SELECT job_id, bet_id, match_id, market_id, attempts, max_attempts, last_error
     FROM settlement_jobs
     WHERE status IN ('DEAD_LETTER', 'AWAITING_EVIDENCE')
       AND (scheduled_at IS NULL OR scheduled_at <= NOW())
     ORDER BY created_at ASC
     LIMIT $1`,
    [limit],
  );

  if (!res.rows.length) {
    return { scanned: 0, settled: 0, requeued: 0, awaiting: 0 };
  }

  const matchLookup = await buildMatchLookupForJobs(res.rows);
  let settled = 0;
  let requeued = 0;
  let awaiting = 0;

  for (const job of res.rows) {
    try {
      const betRes = await query('SELECT * FROM bets WHERE bet_id = $1', [job.bet_id]);
      const bet = betRes.rows[0];
      if (!bet) {
        await query(`UPDATE settlement_jobs SET status = 'FAILED', last_error = 'bet_not_found', completed_at = NOW() WHERE job_id = $1`, [job.job_id]);
        continue;
      }

      const prior = String(bet.status || '').toUpperCase();
      if (['WON', 'LOST', 'VOID', 'CASHED_OUT', 'REFUNDED'].includes(prior)) {
        await query(`UPDATE settlement_jobs SET status = 'COMPLETED', completed_at = NOW() WHERE job_id = $1`, [job.job_id]);
        settled += 1;
        continue;
      }

      const { evaluateBetForSettlement } = await import('../liveMatchSettlement.mjs');
      let evaluated = await evaluateBetForSettlement(bet, matchLookup);

      if (!evaluated) {
        const delay = retryDelayMs((job.attempts || 0) + 1);
        await query(
          `UPDATE settlement_jobs
           SET status = 'AWAITING_EVIDENCE',
               last_error = COALESCE(last_error, 'awaiting_authoritative_evidence'),
               scheduled_at = NOW() + ($2 || ' milliseconds')::interval,
               attempts = attempts + 1
           WHERE job_id = $1`,
          [job.job_id, String(delay)],
        );
        awaiting += 1;
        continue;
      }

      const targetMatch = matchLookup(job.match_id) || { id: job.match_id };
      const authResult = authorizeSettlement({
        bet,
        match: targetMatch,
        marketContext: { marketId: bet.market_id, boundaryReached: Boolean(evaluated) },
        providerObservations: targetMatch.providerObservations || [],
        evaluatedOutcome: evaluated.outcome,
        authorizedBy: 'DeadLetterRecoveryProcessor',
      });

      if (!authResult.success) {
        const delay = retryDelayMs((job.attempts || 0) + 1);
        await query(
          `UPDATE settlement_jobs
           SET status = 'AWAITING_EVIDENCE',
               last_error = $2,
               scheduled_at = NOW() + ($3 || ' milliseconds')::interval,
               attempts = attempts + 1
           WHERE job_id = $1`,
          [job.job_id, authResult.error, String(delay)],
        );
        awaiting += 1;
        continue;
      }

      logSettlement('DEAD_LETTER_RECOVERY_SETTLE', { betId: job.bet_id, outcome: evaluated.outcome, authorizationId: authResult.authorization?.authorizationId });

      const matchState = buildSettlementMatchState(targetMatch);
      const result = await betSettlementEngine.settleSingleBet({
        betId: job.bet_id,
        matchState: {
          ...matchState,
          matchId: job.match_id,
          status: 'COMPLETED',
          __forcedOutcome: evaluated.outcome,
          __settlementReason: evaluated.reason,
          __legOutcomes: evaluated.legOutcomes,
        },
        authorization: authResult.authorization,
      });

      if (result?.status === 'SETTLED' || result?.status === 'ALREADY_SETTLED') {
        await query(`UPDATE settlement_jobs SET status = 'COMPLETED', completed_at = NOW(), last_error = NULL WHERE job_id = $1`, [job.job_id]);
        settled += 1;
      } else {
        const delay = retryDelayMs((job.attempts || 0) + 1);
        await query(
          `UPDATE settlement_jobs SET status = 'AWAITING_EVIDENCE', scheduled_at = NOW() + ($2 || ' milliseconds')::interval, attempts = attempts + 1 WHERE job_id = $1`,
          [job.job_id, String(delay)],
        );
        requeued += 1;
      }
    } catch (err) {
      logSettlement('DEAD_LETTER_RECOVERY_FAILED', { jobId: job.job_id, error: err.message });
      await query(
        `UPDATE settlement_jobs SET status = 'DEAD_LETTER', last_error = $2, scheduled_at = NOW() + interval '1 minute' WHERE job_id = $1`,
        [job.job_id, err.message],
      );
      requeued += 1;
    }
  }

  return { scanned: res.rows.length, settled, requeued, awaiting };
}

/** Scan eligible OPEN bets that passed deterministic boundaries (polling safety net). */
export async function recoverEligibleOpenBets({ limit = 200 } = {}) {
  return settleOpenBetsFromLiveScores({ limit });
}

export async function runSettlementDeadLetterRecovery({
  jobLimit = 30,
  openBetLimit = 200,
  stuckOlderThanHours = 2,
  stuckLimit = 200,
} = {}) {
  const stuck = await recoverStuckProcessingSettlementJobs({
    olderThanHours: stuckOlderThanHours,
    limit: stuckLimit,
  });
  const open = await recoverEligibleOpenBets({ limit: openBetLimit });
  const dead = await recoverDeadLetterSettlementJobs({ limit: jobLimit });
  return { stuck, open, dead };
}
