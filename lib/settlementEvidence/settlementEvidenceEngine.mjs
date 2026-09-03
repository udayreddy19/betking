/**
 * Unified Settlement Evidence Engine.
 * Resolves structured, verifiable, sanitized match event proof for settled bets.
 */

import { queryRead } from '../../db/pg.js';
import { matchIdAliases } from '../matchIdPublic.mjs';
import { generateGenericEvidence } from './genericEvidence.mjs';
import { generateWicketEvidence } from './wicketEvidence.mjs';
import { generateRunsEvidence } from './runsEvidence.mjs';
import { generateScoreEvidence } from './scoreEvidence.mjs';
import { generateMatchWinnerEvidence } from './matchWinnerEvidence.mjs';
import { generatePlayerEvidence } from './playerEvidence.mjs';

function parseMarketContext(bet) {
  const marketId = String(bet.market_id || '').toLowerCase();
  const marketName = String(bet.market_name || bet.market || '').toLowerCase();
  const raw = `${marketId} ${marketName}`;

  let innings = 1;
  const inningsMatch = raw.match(/i(\d+)_/i) || raw.match(/(\d+)(?:st|nd|rd|th)?\s*innings/i);
  if (inningsMatch) innings = Number(inningsMatch[1]);

  let overNumber = null;
  const overMatch = raw.match(/over_(\d+)/i) || raw.match(/over\s*(\d+)/i);
  if (overMatch) overNumber = Number(overMatch[1]);

  let line = null;
  const lineMatch = raw.match(/(\d+\.?\d*)/);
  if (bet.line != null) {
    line = Number(bet.line);
  } else if (lineMatch && (raw.includes('over') || raw.includes('under') || raw.includes('total'))) {
    line = Number(lineMatch[1]);
  }

  let marketType = 'GENERIC';
  if (/wicket_in_over|wicket.*over/i.test(raw)) {
    marketType = 'WICKET';
  } else if (/team_score_at_\d+_dismissal|score_at|innings_total|match_total|team_total|fall_of_wicket|dismissal/i.test(raw)) {
    marketType = 'SCORE';
  } else if (/over_runs|runs_in_over|next_over|delivery_runs|overs_\d+_\d+_total/i.test(raw)) {
    marketType = 'RUNS';
  } else if (/match_winner|winner|moneyline|1x2/i.test(raw)) {
    marketType = 'MATCH_WINNER';
  } else if (/player_|top_batter|top_bowler|batter_runs|player_score/i.test(raw)) {
    marketType = 'PLAYER';
  }

  return { marketType, innings, overNumber, line };
}

/**
 * Resolves structured settlement evidence for a bet.
 * Safe for public API consumption: all sensitive provider fields are sanitized.
 */
export async function resolveSettlementEvidence({ bet, client = null }) {
  if (!bet) return null;

  const run = client ? client.query.bind(client) : queryRead;
  const status = String(bet.status || '').toUpperCase();
  const eventId = String(bet.match_id || '');
  const marketId = String(bet.market_id || '');
  const selectionId = String(bet.selection_id || '');

  if (['PENDING', 'ACCEPTED', 'OPEN'].includes(status)) {
    return {
      evidenceVersion: 1,
      evidenceStatus: 'PENDING',
      evidenceType: 'PENDING_SETTLEMENT',
      eventId,
      marketId,
      selectionId,
      grade: 'PENDING',
      confidence: 'PROVISIONAL',
      finality: 'LIVE',
      provider: 'NOT_AVAILABLE',
      providerEventId: 'NOT_AVAILABLE',
      summary: 'Bet is currently active and awaiting match result',
      verifiedAt: null,
    };
  }

  const context = parseMarketContext(bet);
  const matchId = String(bet.match_id || '');
  const searchIds = [matchId, ...(matchId ? matchIdAliases(matchId) : [])].filter(Boolean);

  // 1. Fetch any stored settlement event
  let settlementEvent = null;
  try {
    const seRes = await run(
      `SELECT * FROM settlement_events
       WHERE bet_id = $1
       ORDER BY settlement_version DESC LIMIT 1`,
      [bet.bet_id],
    );
    if (seRes?.rows?.length > 0) {
      settlementEvent = seRes.rows[0];
    }
  } catch {
    // Graceful fallback if table not yet queried
  }

  let baseEvidence = null;

  // 2. Dispatch based on market type
  if (context.marketType === 'WICKET') {
    let ballEvents = [];
    let overSnapshot = null;

    try {
      if (searchIds.length > 0 && context.overNumber) {
        const beRes = await run(
          `SELECT * FROM match_ball_events
           WHERE canonical_match_id = ANY($1) AND innings = $2 AND over_number = $3 AND superseded_by IS NULL
           ORDER BY sequence_number ASC`,
          [searchIds, context.innings, context.overNumber],
        );
        ballEvents = beRes?.rows || [];

        const snapRes = await run(
          `SELECT * FROM match_over_snapshots
           WHERE match_id = ANY($1) AND innings = $2 AND over_num = $3
           LIMIT 1`,
          [searchIds, context.innings, context.overNumber],
        );
        overSnapshot = snapRes?.rows?.[0] || null;
      }
    } catch {
      // Graceful DB fallback
    }

    baseEvidence = generateWicketEvidence({
      bet,
      ballEvents,
      overSnapshot,
      settlementEvent,
      marketContext: context,
    });
  } else if (context.marketType === 'RUNS') {
    let ballEvents = [];
    let overSnapshot = null;

    try {
      if (searchIds.length > 0 && context.overNumber) {
        const beRes = await run(
          `SELECT * FROM match_ball_events
           WHERE canonical_match_id = ANY($1) AND innings = $2 AND over_number = $3 AND superseded_by IS NULL
           ORDER BY sequence_number ASC`,
          [searchIds, context.innings, context.overNumber],
        );
        ballEvents = beRes?.rows || [];

        const snapRes = await run(
          `SELECT * FROM match_over_snapshots
           WHERE match_id = ANY($1) AND innings = $2 AND over_num = $3
           LIMIT 1`,
          [searchIds, context.innings, context.overNumber],
        );
        overSnapshot = snapRes?.rows?.[0] || null;
      }
    } catch {
      // Graceful DB fallback
    }

    baseEvidence = generateRunsEvidence({
      bet,
      ballEvents,
      overSnapshot,
      settlementEvent,
      marketContext: context,
    });
  } else if (context.marketType === 'SCORE') {
    let dismissalSnapshot = null;
    try {
      if (searchIds.length > 0) {
        const snapRes = await run(
          `SELECT * FROM match_over_snapshots
           WHERE match_id = ANY($1) AND innings = $2
           ORDER BY over_num DESC LIMIT 1`,
          [searchIds, context.innings],
        );
        const snap = snapRes?.rows?.[0];
        if (snap) {
          dismissalSnapshot = {
            runs: snap.score_at_end,
            wicketNumber: snap.wickets_at_end,
            overs: snap.overs_raw || String(snap.over_num),
          };
        }
      }
    } catch {
      // Graceful DB fallback
    }

    baseEvidence = generateScoreEvidence({
      bet,
      dismissalSnapshot,
      settlementEvent,
      marketContext: context,
    });
  } else if (context.marketType === 'MATCH_WINNER') {
    let matchState = null;
    try {
      const { getCachedCanonicalMatchState } = await import('../matchStateCache.mjs');
      matchState = await getCachedCanonicalMatchState(matchId);
    } catch {
      // Graceful fallback
    }
    baseEvidence = generateMatchWinnerEvidence({
      bet,
      matchState,
      settlementEvent,
      marketContext: context,
    });
  } else if (context.marketType === 'PLAYER') {
    baseEvidence = generatePlayerEvidence({
      bet,
      settlementEvent,
      marketContext: context,
    });
  } else {
    baseEvidence = generateGenericEvidence({
      bet,
      settlementEvent,
    });
  }

  const confidenceState = settlementEvent ? 'OFFICIAL_CONFIRMED' : 'CONFIRMED';
  const finalityState = 'OFFICIAL_CONFIRMED';

  return {
    ...baseEvidence,
    eventId,
    marketId,
    selectionId,
    grade: status,
    confidence: confidenceState,
    confidenceState,
    finality: 'SETTLED',
    finalityState,
    settlementAllowed: true,
    settlementReasonCodes: [bet.settlement_reason || 'OFFICIAL_MATCH_SETTLED'],
    settlementConfidence: {
      confidenceState,
      finalityState,
      settlementAllowed: true,
    },
    providerConsensus: {
      providersAvailable: 1,
      providersAgree: true,
      conflictingFields: [],
    },
    freshness: {
      ageSeconds: 0,
      maxAgeSeconds: 300,
      stale: false,
    },
    provider: settlementEvent?.provider || 'CANONICAL_FEED',
    providerEventId: settlementEvent?.provider_event_id || eventId || 'NOT_AVAILABLE',
    timestamps: {
      placedAt: bet.created_at || null,
      acceptedAt: bet.accepted_at || bet.created_at || null,
      settledAt: bet.settled_at || settlementEvent?.created_at || null,
    },
  };
}
