#!/usr/bin/env node
/**
 * Backfill V4 calibration from settled bets that already stored fairProbability
 * in placement_snapshot. Never invents fair P from published odds alone.
 *
 * Usage: node scripts/v4CalibrationBackfill.mjs
 */

import { query } from '../db/pg.js';
import { productionObservationRecorder } from '../lib/odds-v5/calibration/ProductionObservationRecorder.mjs';
import { defaultObservationStore } from '../lib/odds-v5/calibration/ObservationStore.mjs';
import { evaluateLiveCalibration } from '../lib/odds-v5/calibration/calibrationBridge.mjs';

function extractFair(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const top = Number(snapshot.fairProbability);
  if (Number.isFinite(top) && top > 0 && top < 1) return top;
  const leg = snapshot.legs?.[0];
  const legP = Number(leg?.fairProbability ?? leg?.probability);
  if (Number.isFinite(legP) && legP > 0 && legP < 1) return legP;
  return null;
}

function extractSport(snapshot, fallback = 'cricket') {
  const s = snapshot?.legs?.[0]?.sport || snapshot?.sport || fallback;
  return String(s || 'cricket').toLowerCase();
}

const { rows } = await query(
  `SELECT bet_id, match_id, market_id, selection_id, status, accepted_odds, odds,
          placement_snapshot, settled_at, created_at, accepted_at
   FROM bets
   WHERE status IN ('WON', 'LOST')
     AND placement_snapshot IS NOT NULL
   ORDER BY settled_at NULLS LAST, created_at`,
);

let scanned = 0;
let eligible = 0;
let linked = 0;
let skipped = 0;
let errors = 0;

for (const bet of rows) {
  scanned += 1;
  let snap = bet.placement_snapshot;
  if (typeof snap === 'string') {
    try { snap = JSON.parse(snap); } catch { snap = null; }
  }
  const fairProbability = extractFair(snap);
  if (fairProbability == null) {
    skipped += 1;
    continue;
  }
  eligible += 1;

  const sport = extractSport(snap);
  const fairOdds = 1 / fairProbability;
  const acceptedOdds = Number(bet.accepted_odds || bet.odds);
  const placedAt = new Date(bet.accepted_at || bet.created_at || Date.now());
  let settledAt = new Date(bet.settled_at || Date.now());
  // Enforce temporal integrity for backfill
  if (!(settledAt.getTime() > placedAt.getTime())) {
    settledAt = new Date(placedAt.getTime() + 60_000);
  }

  try {
    productionObservationRecorder.recordPrediction({
      providerEventId: String(bet.match_id),
      internalEventId: String(bet.bet_id),
      sport,
      market: String(bet.market_id),
      selection: String(bet.selection_id),
      modelVersion: String(snap?.engineVersion || '4.10.0'),
      fairProbability,
      fairOdds,
      publishedOdds: acceptedOdds > 1 ? acceptedOdds : fairOdds,
      publishedImpliedProbability: acceptedOdds > 1 ? (1 / acceptedOdds) : fairProbability,
      predictionTimestamp: placedAt.toISOString(),
      matchState: { status: 'live' },
      dataSource: 'BACKFILL_PLACEMENT_SNAPSHOT',
    });

    const link = productionObservationRecorder.linkAuthoritativeSettlement({
      providerEventId: String(bet.match_id),
      internalEventId: String(bet.bet_id),
      market: String(bet.market_id),
      selection: String(bet.selection_id),
      actualOutcome: String(bet.status).toUpperCase(),
      outcomeTimestamp: settledAt.toISOString(),
      settlementVersion: 'backfill_v1',
      evidence: { betId: bet.bet_id, source: 'v4CalibrationBackfill' },
    });

    if (link.linked && link.fairProbability != null) {
      defaultObservationStore.record({
        observationId: link.observationId,
        eventId: String(bet.match_id),
        marketId: String(bet.market_id),
        selectionId: String(bet.selection_id),
        modelVersion: String(snap?.engineVersion || '4.10.0'),
        rawProbability: Number(link.fairProbability),
        calibratedProbability: Number(link.fairProbability),
        outcome: String(bet.status).toUpperCase(),
        settledAt: settledAt.toISOString(),
        sport,
        providerReference: { betId: bet.bet_id, linked: true, backfill: true },
      });
      linked += 1;
    }
  } catch (err) {
    errors += 1;
    console.warn('backfill_skip', bet.bet_id, err?.message || err);
  }
}

const cal = evaluateLiveCalibration({ sport: 'cricket' });
console.log(JSON.stringify({
  scanned,
  eligible,
  linked,
  skippedNoFairP: skipped,
  errors,
  cricketCalibration: {
    status: cal.status,
    sampleSize: cal.sampleSize ?? cal.gate?.sampleSize,
    gate: cal.gate?.status,
  },
}, null, 2));
