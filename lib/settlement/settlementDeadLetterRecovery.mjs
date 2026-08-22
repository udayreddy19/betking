/**
 * Recover settlement jobs that exhausted retries — worker failure must not orphan bets.
 */

import { query } from '../../db/pg.js';
import { betSettlementEngine } from '../betSettlementEngine.mjs';
import { buildSettlementMatchState, settleOpenBetsFromLiveScores } from '../liveMatchSettlement.mjs';
import { matchIdAliases } from '../matchIdPublic.mjs';
import { enrichMatchWithCanonicalState } from './settlementCanonicalState.mjs';
import { logSettlement } from './settlementAudit.mjs';

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

      logSettlement('DEAD_LETTER_RECOVERY_SETTLE', { betId: job.bet_id, outcome: evaluated.outcome });

      const matchState = buildSettlementMatchState(matchLookup(job.match_id) || { id: job.match_id });
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

export async function runSettlementDeadLetterRecovery({ jobLimit = 30, openBetLimit = 200 } = {}) {
  const open = await recoverEligibleOpenBets({ limit: openBetLimit });
  const dead = await recoverDeadLetterSettlementJobs({ limit: jobLimit });
  return { open, dead };
}
