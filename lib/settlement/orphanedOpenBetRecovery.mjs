/**
 * Orphaned OPEN bet recovery — close the "provider never emits COMPLETED" gap.
 *
 * Policy (never invent winners; never settle without authorization):
 *  1. Re-hydrate match; run normal settlement when finality/abandonment is available.
 *  2. If still unresolved past reviewHours → enqueue AWAITING_EVIDENCE
 *     with PROVIDER_FINALITY_ORPHAN (ops visibility + retry schedule).
 *  3. Past voidHours → escalate reason to PROVIDER_FINALITY_TIMEOUT_VOID
 *     (still AWAITING_EVIDENCE — operator voids or grades; no silent invent).
 *  4. Multi-day cricket that is still live is never orphan-flagged.
 */

import { query } from '../../db/pg.js';
import { createLogger } from '../logger.mjs';
import { enrichMatchWithCanonicalState } from './settlementCanonicalState.mjs';
import { isMultiDayCricket, isFeedStillLive, inferWallClockMatchFinal } from './wallClockFinality.mjs';
import { buildSettlementMatchState, settleOpenBetsFromLiveScores } from '../liveMatchSettlement.mjs';
import { logSettlement } from './settlementAudit.mjs';
import { matchIdAliases } from '../matchIdPublic.mjs';

const log = createLogger({ engine: 'orphanedOpenBetRecovery' });

export const ORPHAN_REASON = Object.freeze({
  PROVIDER_FINALITY_ORPHAN: 'PROVIDER_FINALITY_ORPHAN',
  PROVIDER_FINALITY_TIMEOUT_VOID: 'PROVIDER_FINALITY_TIMEOUT_VOID',
});

const DEFAULTS = {
  reviewHours: Number(process.env.SETTLEMENT_ORPHAN_REVIEW_HOURS) || 48,
  voidHours: Number(process.env.SETTLEMENT_ORPHAN_VOID_HOURS) || 168,
  limit: 80,
};

async function hydrateMatch(matchId) {
  const id = String(matchId || '');
  if (!id) return null;
  let detail = null;
  try {
    if (/^(oy_|10cric_)/i.test(id)) {
      const { fetch10CricMatchById } = await import('../providers/tencricProvider.mjs');
      detail = await fetch10CricMatchById(id);
    }
  } catch { /* ignore */ }
  if (!detail) {
    try {
      const { getCachedCanonicalMatchState } = await import('../matchStateCache.mjs');
      detail = await getCachedCanonicalMatchState(id);
    } catch { /* ignore */ }
  }
  if (!detail) {
    try {
      const { fetchMatchDetail } = await import('../matchDetailFetcher.mjs');
      detail = await fetchMatchDetail({
        id,
        matchId: id,
        sport: 'cricket',
        source: /^(oy_|10cric_)/i.test(id) ? '10cric' : undefined,
      }, { fast: false }).catch(() => null);
    } catch { /* ignore */ }
  }
  if (!detail && /^srl_/i.test(id)) {
    try {
      const { getIplSrlMatchById } = await import('../iplSrlSimulator.mjs');
      detail = getIplSrlMatchById(id, Date.now(), { forPublic: false });
    } catch { /* ignore */ }
  }
  return detail ? enrichMatchWithCanonicalState(detail) : null;
}

async function flagOrphanBet(betId, matchId, marketId, reason) {
  try {
    await query(
      `INSERT INTO settlement_jobs (
         job_id, bet_id, match_id, market_id, trigger_event_id, status, last_error,
         attempts, max_attempts, scheduled_at, created_at
       )
       VALUES ($1, $2, $3, $4, 'orphan_finality', 'AWAITING_EVIDENCE', $5, 0, 10, NOW() + interval '15 minutes', NOW())
       ON CONFLICT (bet_id, COALESCE(trigger_event_id, 'manual')) DO UPDATE
         SET last_error = EXCLUDED.last_error,
             status = 'AWAITING_EVIDENCE',
             scheduled_at = NOW() + interval '15 minutes'`,
      [`orphan_${betId}`, betId, matchId, marketId || null, reason],
    );
  } catch (err) {
    // Unique index expression may not support ON CONFLICT target on all PG versions —
    // fall back to plain insert ignore + bet reason stamp.
    try {
      await query(
        `INSERT INTO settlement_jobs (
           job_id, bet_id, match_id, market_id, trigger_event_id, status, last_error,
           attempts, max_attempts, scheduled_at, created_at
         )
         VALUES ($1, $2, $3, $4, 'orphan_finality', 'AWAITING_EVIDENCE', $5, 0, 10, NOW() + interval '15 minutes', NOW())
         ON CONFLICT DO NOTHING`,
        [`orphan_${betId}_${Date.now()}`, betId, matchId, marketId || null, reason],
      );
    } catch (err2) {
      log.warn('orphan_enqueue_failed', { betId, err: err2?.message || err?.message });
    }
  }

  try {
    await query(
      `UPDATE bets
       SET settlement_reason = $2
       WHERE bet_id = $1
         AND UPPER(status) IN ('ACCEPTED', 'PENDING', 'OPEN')`,
      [betId, reason],
    );
  } catch { /* ignore */ }
}

/**
 * Recover OPEN bets whose match never reached COMPLETED from the provider.
 */
export async function recoverOrphanedOpenBets(opts = {}) {
  const reviewHours = Math.max(6, Number(opts.reviewHours) || DEFAULTS.reviewHours);
  const voidHours = Math.max(reviewHours + 1, Number(opts.voidHours) || DEFAULTS.voidHours);
  const limit = Math.min(500, Math.max(1, Number(opts.limit) || DEFAULTS.limit));

  const openRes = await query(
    `SELECT bet_id, match_id, market_id, created_at,
            EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600.0 AS age_hours
     FROM bets
     WHERE UPPER(status) IN ('ACCEPTED', 'PENDING', 'OPEN')
       AND created_at < NOW() - ($1 || ' hours')::interval
     ORDER BY created_at ASC
     LIMIT $2`,
    [String(reviewHours), limit],
  );

  const stats = {
    scanned: openRes.rows.length,
    settled: 0,
    awaiting: 0,
    escalated: 0,
    skippedLive: 0,
    errors: 0,
  };

  const byMatch = new Map();
  for (const row of openRes.rows) {
    const mid = String(row.match_id || '');
    if (!mid) continue;
    if (!byMatch.has(mid)) byMatch.set(mid, []);
    byMatch.get(mid).push(row);
  }

  for (const [matchId, bets] of byMatch) {
    let match = null;
    try {
      match = await hydrateMatch(matchId);
    } catch (err) {
      stats.errors += 1;
      log.warn('orphan_hydrate_failed', { matchId, err: err?.message });
    }

    if (match && isMultiDayCricket(match) && isFeedStillLive(match)) {
      stats.skippedLive += bets.length;
      continue;
    }
    if (match && isFeedStillLive(match) && !inferWallClockMatchFinal(match)) {
      stats.skippedLive += bets.length;
      continue;
    }

    if (match) {
      const state = buildSettlementMatchState(match);
      if (state.status === 'COMPLETED' || state.status === 'ABANDONED' || inferWallClockMatchFinal(match)) {
        try {
          const part = await settleOpenBetsFromLiveScores({
            limit: Math.max(bets.length, 20),
            matchId,
            seedMatches: [match],
          });
          stats.settled += part.settled || 0;
          logSettlement('ORPHAN_FINALITY_SETTLE', {
            matchId,
            settled: part.settled,
            aliases: matchIdAliases(matchId),
            status: state.status,
          });
          continue;
        } catch (err) {
          stats.errors += 1;
          log.warn('orphan_settle_failed', { matchId, err: err?.message });
        }
      }
    }

    for (const bet of bets) {
      const ageHours = Number(bet.age_hours) || 0;
      const reason = ageHours >= voidHours
        ? ORPHAN_REASON.PROVIDER_FINALITY_TIMEOUT_VOID
        : ORPHAN_REASON.PROVIDER_FINALITY_ORPHAN;
      try {
        await flagOrphanBet(bet.bet_id, matchId, bet.market_id, reason);
        if (reason === ORPHAN_REASON.PROVIDER_FINALITY_TIMEOUT_VOID) stats.escalated += 1;
        else stats.awaiting += 1;
        logSettlement('ORPHAN_FLAGGED', {
          betId: bet.bet_id,
          matchId,
          ageHours,
          reason,
        });
      } catch (err) {
        stats.errors += 1;
        log.warn('orphan_bet_failed', { betId: bet.bet_id, err: err?.message });
      }
    }
  }

  return stats;
}
