/**
 * Canonical ball/event stream — normalize provider over history into durable events.
 * Settlement reads confirmed events only; never guesses from UI commentary strings.
 */

import { query } from '../../db/pg.js';
import { formatBallOutcome, isNonLegalDelivery, parseDeliveryBallOutcome } from '../cricketBallOutcome.mjs';
import { getBattingOversAndScore } from '../matchOverSnapshotStore.mjs';

let ensured = false;

export async function ensureBallEventsTable() {
  if (ensured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS match_ball_events (
      event_id VARCHAR(128) PRIMARY KEY,
      canonical_match_id VARCHAR(128) NOT NULL,
      innings INT NOT NULL DEFAULT 1,
      over_number INT NOT NULL,
      ball_number INT NOT NULL,
      sequence_number BIGINT NOT NULL,
      event_type VARCHAR(32) NOT NULL,
      runs INT NOT NULL DEFAULT 0,
      batter_runs INT NOT NULL DEFAULT 0,
      extras INT NOT NULL DEFAULT 0,
      wicket BOOLEAN NOT NULL DEFAULT FALSE,
      wicket_type VARCHAR(32),
      is_boundary BOOLEAN NOT NULL DEFAULT FALSE,
      is_confirmed BOOLEAN NOT NULL DEFAULT TRUE,
      provider VARCHAR(64),
      provider_event_id VARCHAR(128),
      state_version INT,
      raw_label VARCHAR(16),
      occurred_at TIMESTAMPTZ,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      superseded_by VARCHAR(128)
    );
  `);
  ensured = true;
}

export function classifyEventType(label) {
  const raw = String(label || '').trim();
  if (raw === 'W') return 'WICKET';
  if (raw === '•' || raw === '.' || raw === '0') return 'DOT';
  if (/wd/i.test(raw)) return 'WIDE';
  if (/nb/i.test(raw)) return 'NO_BALL';
  if (/lb/i.test(raw)) return 'LEG_BYE';
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    if (n === 4) return 'FOUR';
    if (n === 6) return 'SIX';
    return 'RUN';
  }
  return 'UNKNOWN';
}

export function buildCanonicalEventId(matchId, innings, over, ball, seq) {
  return `mbe_${matchId}_i${innings}_o${over}_b${ball}_s${seq}`;
}

export function normalizeBallToCanonicalEvent({
  matchId,
  innings,
  overNumber,
  ballNumber,
  sequenceNumber,
  rawBall,
  provider = null,
  providerEventId = null,
  stateVersion = null,
  isConfirmed = true,
}) {
  const label = formatBallOutcome(rawBall);
  const parsed = parseDeliveryBallOutcome(label) || { kind: 'unknown', runs: 0, isBoundary: false };
  const eventType = classifyEventType(label);
  const runs = parsed.kind === 'wicket' ? 0 : (parsed.runs ?? 0);

  return {
    eventId: buildCanonicalEventId(matchId, innings, overNumber, ballNumber, sequenceNumber),
    canonicalMatchId: String(matchId),
    innings,
    overNumber,
    ballNumber,
    sequenceNumber,
    eventType,
    runs,
    batterRuns: runs,
    extras: isNonLegalDelivery(label) ? runs : 0,
    wicket: parsed.kind === 'wicket',
    wicketType: parsed.kind === 'wicket' ? 'OUT' : null,
    isBoundary: Boolean(parsed.isBoundary),
    isConfirmed,
    provider,
    providerEventId: providerEventId || `${matchId}:${innings}:${overNumber}:${ballNumber}:${sequenceNumber}`,
    stateVersion,
    rawLabel: label,
    occurredAt: new Date().toISOString(),
  };
}

/** Extract legal deliveries from an over row into canonical events. */
export function extractLegalBallsFromOverRow(row, innings, matchId, startSeq = 0) {
  const overNum = Number(row.overNum || row.over || row.number);
  if (!Number.isFinite(overNum) || overNum <= 0) return { events: [], nextSeq: startSeq };

  const balls = Array.isArray(row.balls) ? row.balls : [];
  const events = [];
  let legal = 0;
  let seq = startSeq;

  for (const raw of balls) {
    const label = formatBallOutcome(raw);
    if (isNonLegalDelivery(label)) {
      seq += 1;
      events.push(normalizeBallToCanonicalEvent({
        matchId,
        innings,
        overNumber: overNum,
        ballNumber: 0,
        sequenceNumber: seq,
        rawBall: raw,
        isConfirmed: !row.isCurrent,
      }));
      continue;
    }
    legal += 1;
    seq += 1;
    events.push(normalizeBallToCanonicalEvent({
      matchId,
      innings,
      overNumber: overNum,
      ballNumber: legal,
      sequenceNumber: seq,
      rawBall: raw,
      isConfirmed: !row.isCurrent,
    }));
  }

  return { events, nextSeq: seq };
}

export async function upsertCanonicalBallEvent(event) {
  await ensureBallEventsTable();

  const existing = await query(
    `SELECT event_id, raw_label, sequence_number, is_confirmed
     FROM match_ball_events
     WHERE canonical_match_id = $1 AND innings = $2 AND over_number = $3 AND ball_number = $4
       AND superseded_by IS NULL
     ORDER BY sequence_number DESC LIMIT 1`,
    [event.canonicalMatchId, event.innings, event.overNumber, event.ballNumber],
  );

  const prev = existing.rows[0];
  if (prev) {
    if (prev.raw_label === event.rawLabel && prev.is_confirmed === event.isConfirmed) {
      return { action: 'IDEMPOTENT', eventId: prev.event_id };
    }
    if (event.sequenceNumber <= Number(prev.sequence_number || 0)) {
      return { action: 'STALE_REJECTED', eventId: prev.event_id };
    }
    await query(
      `UPDATE match_ball_events SET superseded_by = $1, is_confirmed = FALSE WHERE event_id = $2`,
      [event.eventId, prev.event_id],
    );
  }

  await query(
    `INSERT INTO match_ball_events (
       event_id, canonical_match_id, innings, over_number, ball_number, sequence_number,
       event_type, runs, batter_runs, extras, wicket, wicket_type, is_boundary, is_confirmed,
       provider, provider_event_id, state_version, raw_label, occurred_at, received_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW())
     ON CONFLICT (event_id) DO NOTHING`,
    [
      event.eventId,
      event.canonicalMatchId,
      event.innings,
      event.overNumber,
      event.ballNumber,
      event.sequenceNumber,
      event.eventType,
      event.runs,
      event.batterRuns,
      event.extras,
      event.wicket,
      event.wicketType,
      event.isBoundary,
      event.isConfirmed,
      event.provider,
      event.providerEventId,
      event.stateVersion,
      event.rawLabel,
      event.occurredAt,
    ],
  );

  return { action: prev ? 'CORRECTED' : 'INSERTED', eventId: event.eventId };
}

/** Ingest all ball events from match overHistory + current over balls. */
export async function ingestBallEventsFromMatch(match) {
  if (!match?.id && !match?.matchId) return { ingested: 0, corrections: 0 };
  await ensureBallEventsTable();

  const matchId = String(match.id || match.matchId);
  const bat = getBattingOversAndScore(match);
  const innings = bat.innings || 1;
  const history = match.overHistory || match.liveDetails?.overHistory || [];
  const currentBalls = match.liveDetails?.currentOverBalls || [];

  let seqRes = await query(
    `SELECT COALESCE(MAX(sequence_number), 0) AS max_seq
     FROM match_ball_events WHERE canonical_match_id = $1`,
    [matchId],
  );
  let seq = Number(seqRes.rows[0]?.max_seq || 0);

  let ingested = 0;
  let corrections = 0;

  for (const row of history) {
    const rowInnings = Number(row.inningsId || row.innings || innings) || innings;
    const { events, nextSeq } = extractLegalBallsFromOverRow(row, rowInnings, matchId, seq);
    seq = nextSeq;
    for (const ev of events) {
      const res = await upsertCanonicalBallEvent(ev);
      if (res.action === 'INSERTED') ingested += 1;
      if (res.action === 'CORRECTED') corrections += 1;
    }
  }

  if (Array.isArray(currentBalls) && currentBalls.length) {
    const parts = String(bat.oversStr || '').match(/^(\d+)(?:\.(\d+))?$/);
    const overNum = parts
      ? (Number(parts[2] || 0) === 0 ? Number(parts[1]) : Number(parts[1]) + 1)
      : 1;
    const { events, nextSeq } = extractLegalBallsFromOverRow(
      { overNum, balls: currentBalls, isCurrent: true },
      innings,
      matchId,
      seq,
    );
    seq = nextSeq;
    for (const ev of events) {
      const res = await upsertCanonicalBallEvent({ ...ev, isConfirmed: false });
      if (res.action === 'INSERTED') ingested += 1;
      if (res.action === 'CORRECTED') corrections += 1;
    }
  }

  return { ingested, corrections, matchId };
}

/** Get confirmed ball outcome for settlement grading. */
export async function getConfirmedBallEvent(matchId, innings, overNumber, ballNumber) {
  await ensureBallEventsTable();
  const res = await query(
    `SELECT * FROM match_ball_events
     WHERE canonical_match_id = $1 AND innings = $2 AND over_number = $3 AND ball_number = $4
       AND is_confirmed = TRUE AND superseded_by IS NULL
     ORDER BY sequence_number DESC LIMIT 1`,
    [String(matchId), innings, overNumber, ballNumber],
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    eventId: row.event_id,
    rawLabel: row.raw_label,
    parsed: parseDeliveryBallOutcome(row.raw_label),
    isConfirmed: row.is_confirmed,
    sequenceNumber: row.sequence_number,
  };
}

/** Mark all balls in a completed over as confirmed. */
export async function confirmOverBallEvents(matchId, innings, overNumber) {
  await ensureBallEventsTable();
  const res = await query(
    `UPDATE match_ball_events
     SET is_confirmed = TRUE
     WHERE canonical_match_id = $1 AND innings = $2 AND over_number = $3
       AND superseded_by IS NULL
     RETURNING event_id`,
    [String(matchId), innings, overNumber],
  );
  return res.rowCount || 0;
}

export async function getMaxSequenceNumber(matchId) {
  await ensureBallEventsTable();
  const res = await query(
    `SELECT COALESCE(MAX(sequence_number), 0) AS max_seq
     FROM match_ball_events WHERE canonical_match_id = $1`,
    [String(matchId)],
  );
  return Number(res.rows[0]?.max_seq || 0);
}
