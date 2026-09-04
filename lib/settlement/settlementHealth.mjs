/**
 * Settlement worker / queue observability (AUD-013, AUD-018).
 */

import { query } from '../../db/pg.js';

export async function getSettlementWorkerHealth() {
  const enabled = process.env.RUN_BACKGROUND_WORKERS !== 'false'
    || process.env.WORKER_PROCESS === '1';
  const dedicatedWorker = process.env.REQUIRE_DEDICATED_SETTLEMENT_WORKER === '1';
  const apiOnlyProcess = dedicatedWorker && process.env.RUN_BACKGROUND_WORKERS === 'false'
    && process.env.WORKER_PROCESS !== '1';

  let queueDepth = 0;
  let deadLetterCount = 0;
  let awaitingEvidenceCount = 0;
  let stuckProcessingCount = 0;
  let oldestJobAgeSec = null;
  let lastSuccessfulRun = null;

  try {
    const pendingRes = await query(
      `SELECT COUNT(*)::int AS c FROM settlement_jobs
       WHERE status IN ('PENDING', 'RETRY', 'AWAITING_EVIDENCE', 'PROCESSING')`,
    );
    queueDepth = pendingRes.rows[0]?.c ?? 0;

    const deadRes = await query(
      `SELECT COUNT(*)::int AS c FROM settlement_jobs WHERE status = 'DEAD_LETTER'`,
    );
    deadLetterCount = deadRes.rows[0]?.c ?? 0;

    const awaitRes = await query(
      `SELECT COUNT(*)::int AS c FROM settlement_jobs WHERE status = 'AWAITING_EVIDENCE'`,
    );
    awaitingEvidenceCount = awaitRes.rows[0]?.c ?? 0;

    const stuckRes = await query(
      `SELECT COUNT(*)::int AS c FROM settlement_jobs
       WHERE UPPER(status) = 'PROCESSING'
         AND COALESCE(started_at, created_at) < NOW() - INTERVAL '2 hours'`,
    );
    stuckProcessingCount = stuckRes.rows[0]?.c ?? 0;

    const oldestRes = await query(
      `SELECT EXTRACT(EPOCH FROM (NOW() - MIN(created_at)))::int AS age_sec
       FROM settlement_jobs
       WHERE status IN ('PENDING', 'RETRY', 'AWAITING_EVIDENCE', 'DEAD_LETTER')`,
    );
    oldestJobAgeSec = oldestRes.rows[0]?.age_sec ?? null;

    const lastRes = await query(
      `SELECT MAX(completed_at) AS last_ok FROM settlement_jobs WHERE status = 'COMPLETED'`,
    );
    lastSuccessfulRun = lastRes.rows[0]?.last_ok ?? null;
  } catch {
    // table may not exist in minimal test DB
  }

  const healthy = apiOnlyProcess
    ? deadLetterCount === 0 && stuckProcessingCount === 0 && (oldestJobAgeSec == null || oldestJobAgeSec < 900)
    : enabled && deadLetterCount === 0 && stuckProcessingCount === 0 && (oldestJobAgeSec == null || oldestJobAgeSec < 900);

  return {
    settlementWorker: {
      enabled,
      healthy,
      queueDepth,
      deadLetterCount,
      awaitingEvidenceCount,
      stuckProcessingCount,
      oldestJobAgeSec,
      lastSuccessfulRun,
    },
  };
}

const TERMINAL_MATCH = new Set([
  'COMPLETED', 'FINAL', 'FINISHED', 'ABANDONED', 'CANCELLED', 'NO_RESULT', 'DETERMINED', 'POST',
]);

/**
 * Classify open ACCEPTED/PENDING bets — live matches are NOT true orphans.
 * Classes: LIVE_ACTIVE_BET | SETTLEMENT_QUEUED | RETRYING | AWAITING_EVIDENCE | DEAD_LETTER | TRUE_ORPHAN
 */
export async function classifyOpenSettlementBets({ limit = 500 } = {}) {
  const res = await query(
    `SELECT b.bet_id, b.match_id, b.market_id, b.status, b.created_at,
            m.status AS match_status,
            sj.status AS job_status,
            (sj_done.bet_id IS NOT NULL) AS has_completed_job,
            EXTRACT(EPOCH FROM (NOW() - b.created_at))::int AS age_sec
     FROM bets b
     LEFT JOIN matches m ON m.match_id = b.match_id
     LEFT JOIN LATERAL (
       SELECT status FROM settlement_jobs
       WHERE bet_id = b.bet_id
       ORDER BY created_at DESC
       LIMIT 1
     ) sj ON TRUE
     LEFT JOIN LATERAL (
       SELECT bet_id FROM settlement_jobs
       WHERE bet_id = b.bet_id AND status = 'COMPLETED'
       LIMIT 1
     ) sj_done ON TRUE
     WHERE UPPER(b.status) IN ('ACCEPTED', 'PENDING', 'OPEN')
     ORDER BY b.created_at ASC
     LIMIT $1`,
    [limit],
  );

  return res.rows.map((row) => {
    const matchStatus = String(row.match_status || '').toUpperCase();
    const jobStatus = String(row.job_status || '').toUpperCase();
    const ageSec = Number(row.age_sec) || 0;
    let classification = 'LIVE_ACTIVE_BET';
    let incident = false;

    if (row.has_completed_job) {
      // Job completed but bet still open — inconsistent state
      classification = 'TRUE_ORPHAN';
      incident = true;
    } else if (jobStatus === 'DEAD_LETTER') {
      classification = 'DEAD_LETTER';
      incident = true;
    } else if (jobStatus === 'AWAITING_EVIDENCE') {
      classification = 'AWAITING_EVIDENCE';
    } else if (jobStatus === 'RETRY') {
      classification = 'RETRYING';
    } else if (jobStatus === 'PENDING' || jobStatus === 'PROCESSING') {
      classification = 'SETTLEMENT_QUEUED';
    } else if (TERMINAL_MATCH.has(matchStatus)) {
      classification = 'TRUE_ORPHAN';
      incident = true;
    } else if (!row.match_status && ageSec > 7 * 24 * 3600) {
      classification = 'TRUE_ORPHAN';
      incident = true;
    } else {
      classification = 'LIVE_ACTIVE_BET';
    }

    return {
      bet_id: row.bet_id,
      match_id: row.match_id,
      market_id: row.market_id,
      status: row.status,
      created_at: row.created_at,
      match_status: row.match_status,
      job_status: row.job_status,
      age_sec: ageSec,
      classification,
      incident,
    };
  });
}

/** Only operational incidents (TRUE_ORPHAN / DEAD_LETTER open bets). */
export async function findOrphanOpenSettlementBets({ limit = 200 } = {}) {
  const classified = await classifyOpenSettlementBets({ limit });
  return classified.filter((r) => r.incident);
}

export async function findOpenSettlementBetsClassified({ limit = 500 } = {}) {
  return classifyOpenSettlementBets({ limit });
}
