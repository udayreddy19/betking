/**
 * Event-driven settlement bridge — triggered on authoritative score updates.
 * Polling remains recovery-only via schedulerWorker.
 */

import { logSettlement } from './settlementAudit.mjs';
import { matchIdAliases } from '../matchIdPublic.mjs';

const debounceTimers = new Map();
const DEBOUNCE_MS = 300;

export async function runEventDrivenSettlementForMatch(match) {
  const matchId = String(match?.id || match?.matchId || '').trim();
  if (!matchId) return { skipped: true };

  logSettlement('SETTLEMENT_ELIGIBLE', { matchId, source: 'event_driven' });

  const { ingestBallEventsFromMatch, confirmOverBallEvents } = await import('./canonicalBallEvents.mjs');
  const { getBattingOversAndScore, parseOversParts } = await import('../matchOverSnapshotStore.mjs');
  const { recordMatchOverSnapshots, recordMatchDismissalSnapshots } = await import('../matchOverSnapshotStore.mjs');
  const { settleOpenBetsFromLiveScores } = await import('../liveMatchSettlement.mjs');
  const { processSettlementQueue, enqueueBetsForMarketInstance } = await import('./settlementQueue.mjs');
  const { enrichMatchWithCanonicalState } = await import('./settlementCanonicalState.mjs');

  const enriched = enrichMatchWithCanonicalState(match);
  let withBalls = enriched;

  try {
    // Pull Cricbuzz full-commentary ball feed for any cricket format when list has no overHistory.
    const { enrichMatchWithBallFeed, matchHasBallFeed } = await import('../cricbuzzBallFeed.mjs');
    if (!matchHasBallFeed(enriched)) {
      withBalls = await enrichMatchWithBallFeed(enriched);
    }
  } catch (err) {
    console.error('[settlementEventBridge] ball feed', matchId, err.message);
  }

  try {
    await recordMatchOverSnapshots(withBalls);
    await recordMatchDismissalSnapshots(withBalls);
    await ingestBallEventsFromMatch(withBalls);

    const bat = getBattingOversAndScore(withBalls);
    const parts = parseOversParts(bat.oversStr);
    if (parts?.balls === 0 && parts.completed > 0) {
      await confirmOverBallEvents(matchId, bat.innings, parts.completed);
      const overCompletedPayload = {
        event: 'OVER_COMPLETED',
        matchId,
        canonicalMatchId: withBalls.canonicalMatchId || matchId,
        innings: bat.innings,
        completedOver: parts.completed,
        totalBalls: parts.completed * 6 + (parts.balls || 0),
        score: bat.score,
        stateVersion: withBalls.stateVersion ?? withBalls.canonicalState?.stateVersion ?? null,
        occurredAt: new Date().toISOString(),
      };
      logSettlement('OVER_COMPLETED', overCompletedPayload);

      const aliasIds = [...new Set([matchId, ...matchIdAliases(matchId)])];
      for (const mid of aliasIds) {
        await enqueueBetsForMarketInstance({
          matchId: mid,
          marketInstanceKey: `OVER_TOTAL:I${bat.innings}:O${parts.completed}`,
          triggerEventId: `evt_over_${mid}_i${bat.innings}_o${parts.completed}`,
          marketIdPattern: `%next_over_${parts.completed}_total%`,
        });
        await enqueueBetsForMarketInstance({
          matchId: mid,
          marketInstanceKey: `WICKET_IN_OVER:I${bat.innings}:O${parts.completed}`,
          triggerEventId: `evt_wkt_over_${mid}_i${bat.innings}_o${parts.completed}`,
          marketIdPattern: `%wicket_in_%over_${parts.completed}%`,
        });
        await enqueueBetsForMarketInstance({
          matchId: mid,
          marketInstanceKey: `MILESTONE:I${bat.innings}:O0-${parts.completed}`,
          triggerEventId: `evt_milestone_${mid}_i${bat.innings}_o${parts.completed}`,
          marketIdPattern: `%overs_0_${parts.completed}_total%`,
        });
        await enqueueBetsForMarketInstance({
          matchId: mid,
          marketInstanceKey: `NEXT_DELIVERY:I${bat.innings}:O${parts.completed}`,
          triggerEventId: `evt_delivery_${mid}_i${bat.innings}_o${parts.completed}`,
          marketIdPattern: `%next_delivery_%_${parts.completed}_%`,
        });
      }
    }
  } catch (err) {
    console.error('[settlementEventBridge] snapshot', matchId, err.message);
  }

  const aliasSet = new Set([matchId, ...matchIdAliases(matchId)].map(String));
  const matchLookup = (id) => (aliasSet.has(String(id)) ? withBalls : null);

  const liveRes = await settleOpenBetsFromLiveScores({ limit: 100, matchId });
  const queueRes = await processSettlementQueue({ limit: 30, matchLookup });

  return {
    matchId,
    live: liveRes,
    queue: queueRes,
  };
}

/** Debounced per-match settlement after aggregator/provider tick. */
export function scheduleEventDrivenSettlement(matches = []) {
  if (!Array.isArray(matches) || !matches.length) return;

  for (const match of matches) {
    const matchId = String(match?.id || match?.matchId || '').trim();
    if (!matchId) continue;

    const state = String(match?.matchState || match?.status || '').toLowerCase();
    const isLive = state === 'in' || match?.isLive;
    const isFinal = state === 'post' || state === 'completed' || /^(completed|final|finished)$/i.test(String(match?.time || ''));
    if (!isLive && !isFinal) continue;

    if (debounceTimers.has(matchId)) {
      clearTimeout(debounceTimers.get(matchId));
    }

    debounceTimers.set(matchId, setTimeout(() => {
      debounceTimers.delete(matchId);
      runEventDrivenSettlementForMatch(match).catch((err) => {
        console.error('[settlementEventBridge]', matchId, err.message);
      });
    }, DEBOUNCE_MS));
  }
}

/** Recovery sweep — finds stale pending bets (polling backup). */
export async function runSettlementRecoverySweep({ limit = 200 } = {}) {
  const { settleOpenBetsFromLiveScores } = await import('../liveMatchSettlement.mjs');
  const { processSettlementQueue } = await import('./settlementQueue.mjs');
  const { aggregateLiveScores } = await import('../aggregator.mjs');
  const { matchIdAliases } = await import('../matchIdPublic.mjs');
  const { enrichMatchWithCanonicalState } = await import('./settlementCanonicalState.mjs');
  const { query } = await import('../../db/pg.js');

  const res = await settleOpenBetsFromLiveScores({ limit });

  let matches = [];
  try {
    const snap = await aggregateLiveScores({ force: false });
    matches = snap?.matches || [];
  } catch { /* empty */ }

  const byId = new Map();
  const indexMatch = (m) => {
    const enriched = enrichMatchWithCanonicalState(m);
    for (const alias of [m.id, m.matchId, ...(matchIdAliases(m.id || m.matchId) || [])]) {
      if (alias) byId.set(String(alias), enriched);
    }
  };
  for (const m of matches) indexMatch(m);

  // Hydrate open-bet fixtures missing from live ticker (same as liveMatchSettlement sweep)
  try {
    const openRes = await query(
      `SELECT DISTINCT match_id FROM bets
       WHERE UPPER(status) IN ('ACCEPTED', 'PENDING', 'OPEN')
       LIMIT $1`,
      [Math.min(limit, 500)],
    );
    for (const row of openRes.rows) {
      const id = String(row.match_id || '');
      if (!id || byId.has(id)) continue;
      let detail = null;
      if (/^(oy_|10cric_)/i.test(id)) {
        const { fetch10CricMatchById } = await import('../providers/tencricProvider.mjs');
        detail = await fetch10CricMatchById(id);
      }
      if (!detail) {
        const { getCachedCanonicalMatchState } = await import('../matchStateCache.mjs');
        detail = await getCachedCanonicalMatchState(id);
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
      if (detail) indexMatch(detail);
    }
  } catch (err) {
    console.error('[settlementRecovery] hydrate', err.message);
  }

  const queueRes = await processSettlementQueue({
    limit: 50,
    matchLookup: (id) => byId.get(String(id)) || null,
  });

  let deadLetter = { scanned: 0, settled: 0, requeued: 0, awaiting: 0 };
  try {
    const { runSettlementDeadLetterRecovery } = await import('./settlementDeadLetterRecovery.mjs');
    deadLetter = await runSettlementDeadLetterRecovery({ jobLimit: 30, openBetLimit: Math.min(limit, 200) });
  } catch (err) {
    console.error('[settlementRecovery] dead-letter', err.message);
  }

  return { recovery: res, queue: queueRes, deadLetter };
}
