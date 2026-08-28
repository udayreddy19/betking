/**
 * Unified Settlement Evidence Engine.
 * Resolves structured, verifiable, sanitized match event proof for settled bets.
 */

import { query, queryRead } from '../../db/pg.js';
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
  if (/wicket_in_over|wicket.*over|fall_of_wicket/i.test(raw)) {
    marketType = 'WICKET';
  } else if (/over_runs|runs_in_over|next_over|delivery_runs/i.test(raw)) {
    marketType = 'RUNS';
  } else if (/score_at|score_at_10th|innings_total|match_total/i.test(raw)) {
    marketType = 'SCORE';
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

  if (['PENDING', 'ACCEPTED', 'OPEN'].includes(status)) {
    return {
      evidenceVersion: 1,
      evidenceStatus: 'PENDING',
      evidenceType: 'PENDING_SETTLEMENT',
      summary: 'Bet is currently active and awaiting match result',
      verifiedAt: null,
    };
  }

  const context = parseMarketContext(bet);
  const matchId = String(bet.match_id || '');

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

  // 2. Dispatch based on market type
  if (context.marketType === 'WICKET') {
    let ballEvents = [];
    let overSnapshot = null;

    try {
      if (matchId && context.overNumber) {
        const beRes = await run(
          `SELECT * FROM match_ball_events
           WHERE canonical_match_id = $1 AND innings = $2 AND over_number = $3 AND superseded_by IS NULL
           ORDER BY sequence_number ASC`,
          [matchId, context.innings, context.overNumber],
        );
        ballEvents = beRes?.rows || [];

        const snapRes = await run(
          `SELECT * FROM match_over_snapshots
           WHERE match_id = $1 AND innings = $2 AND over_num = $3
           LIMIT 1`,
          [matchId, context.innings, context.overNumber],
        );
        overSnapshot = snapRes?.rows?.[0] || null;
      }
    } catch {
      // Graceful DB fallback
    }

    return generateWicketEvidence({
      bet,
      ballEvents,
      overSnapshot,
      settlementEvent,
      marketContext: context,
    });
  }

  if (context.marketType === 'RUNS') {
    let ballEvents = [];
    let overSnapshot = null;

    try {
      if (matchId && context.overNumber) {
        const beRes = await run(
          `SELECT * FROM match_ball_events
           WHERE canonical_match_id = $1 AND innings = $2 AND over_number = $3 AND superseded_by IS NULL
           ORDER BY sequence_number ASC`,
          [matchId, context.innings, context.overNumber],
        );
        ballEvents = beRes?.rows || [];

        const snapRes = await run(
          `SELECT * FROM match_over_snapshots
           WHERE match_id = $1 AND innings = $2 AND over_num = $3
           LIMIT 1`,
          [matchId, context.innings, context.overNumber],
        );
        overSnapshot = snapRes?.rows?.[0] || null;
      }
    } catch {
      // Graceful DB fallback
    }

    return generateRunsEvidence({
      bet,
      ballEvents,
      overSnapshot,
      settlementEvent,
      marketContext: context,
    });
  }

  if (context.marketType === 'SCORE') {
    let dismissalSnapshot = null;
    try {
      if (matchId) {
        const snapRes = await run(
          `SELECT * FROM match_dismissal_snapshots
           WHERE match_id = $1 AND innings = $2
           ORDER BY wicket_number DESC LIMIT 1`,
          [matchId, context.innings],
        );
        dismissalSnapshot = snapRes?.rows?.[0] || null;
      }
    } catch {
      // Graceful DB fallback
    }

    return generateScoreEvidence({
      bet,
      dismissalSnapshot,
      settlementEvent,
      marketContext: context,
    });
  }

  if (context.marketType === 'MATCH_WINNER') {
    return generateMatchWinnerEvidence({
      bet,
      settlementEvent,
      marketContext: context,
    });
  }

  if (context.marketType === 'PLAYER') {
    return generatePlayerEvidence({
      bet,
      settlementEvent,
      marketContext: context,
    });
  }

  return generateGenericEvidence({
    bet,
    settlementEvent,
  });
}
