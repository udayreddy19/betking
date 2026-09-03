/**
 * Settlement replay — re-grade a bet from current match state without mutating finances.
 */

import { evaluateBetForSettlement, buildSettlementMatchState } from '../liveMatchSettlement.mjs';
import { getSettlementHistory } from './settlementAudit.mjs';

export async function replayBetSettlement({ bet, matchLookup }) {
  if (!bet) return { error: 'bet_required' };

  const evaluated = matchLookup
    ? await evaluateBetForSettlement(bet, matchLookup)
    : null;

  const stored = {
    status: bet.status,
    actualPayout: bet.actual_payout,
    settlementReason: bet.settlement_reason,
    settlementVersion: bet.settlement_version,
  };

  const history = await getSettlementHistory(bet.bet_id);

  const mismatch = evaluated && stored.status
    && ['WON', 'LOST', 'VOID'].includes(String(stored.status).toUpperCase())
    && String(evaluated.outcome).toUpperCase() !== String(stored.status).toUpperCase();

  const matchId = bet.match_id
    || bet.selections?.[0]?.match_id
    || bet.selections?.[0]?.matchId
    || null;
  const liveMatch = matchId && matchLookup ? matchLookup(matchId) : null;

  return {
    betId: bet.bet_id,
    stored,
    replayed: evaluated,
    settlementHistory: history,
    discrepancy: mismatch ? {
      stored: stored.status,
      replayed: evaluated.outcome,
      reason: evaluated.reason,
    } : null,
    matchId,
    match: liveMatch ? matchSnapshotForAdmin(liveMatch) : null,
    matchState: liveMatch
      ? buildSettlementMatchState(liveMatch)
      : null,
  };
}

/** Compact live match payload for admin verify — same fields the user tracker needs. */
export function matchSnapshotForAdmin(match) {
  if (!match || typeof match !== 'object') return null;
  return {
    id: match.id || match.matchId || null,
    matchId: match.matchId || match.id || null,
    sport: match.sport || 'cricket',
    league: match.league || match.competition || null,
    source: match.source || null,
    status: match.status || null,
    isLive: match.isLive,
    isCompleted: match.isCompleted,
    matchState: match.matchState || null,
    time: match.time || null,
    result: match.result || null,
    cricbuzzMatchId: match.cricbuzzMatchId || null,
    espnEventId: match.espnEventId || null,
    espnPath: match.espnPath || null,
    fancodeMatchId: match.fancodeMatchId || null,
    tencricEventId: match.tencricEventId || null,
    team1: match.team1 || null,
    team2: match.team2 || null,
    liveDetails: match.liveDetails || null,
    squads: Array.isArray(match.squads) ? match.squads : [],
    scorecardInnings: Array.isArray(match.scorecardInnings) ? match.scorecardInnings : [],
    overHistory: Array.isArray(match.overHistory) ? match.overHistory : [],
  };
}
