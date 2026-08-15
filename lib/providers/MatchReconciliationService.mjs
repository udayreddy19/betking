/**
 * Match Reconciliation & State Validation Service
 * Combines provider score inputs into unified canonical match state.
 * Validates score transitions and enforces monotonic stateVersion ordering.
 */

import { CanonicalEntityResolver } from './CanonicalEntityResolver.mjs';

const CANONICAL_MATCH_CACHE = new Map();

export class MatchReconciliationService {
  /**
   * Reconciles raw match payload into validated canonical match state
   */
  static reconcileMatch(rawMatch = {}, providerId = 'UNKNOWN') {
    const rawMatchId = String(rawMatch.id || rawMatch.matchId || rawMatch.match_id || `match_${Date.now()}`);
    
    const team1Name = typeof rawMatch.team1 === 'string' ? rawMatch.team1 : (rawMatch.team1?.name || rawMatch.homeTeam || 'Team 1');
    const team2Name = typeof rawMatch.team2 === 'string' ? rawMatch.team2 : (rawMatch.team2?.name || rawMatch.awayTeam || 'Team 2');

    const team1CanonicalId = CanonicalEntityResolver.resolveTeamId(team1Name);
    const team2CanonicalId = CanonicalEntityResolver.resolveTeamId(team2Name);

    const canonicalMatchId = rawMatchId.startsWith('m_') ? rawMatchId : `m_${team1CanonicalId}_vs_${team2CanonicalId}`;

    const existingState = CANONICAL_MATCH_CACHE.get(canonicalMatchId);

    const incomingStateVersion = Number(rawMatch.stateVersion || rawMatch.version || ((existingState?.stateVersion || 0) + 1));

    // Reject out-of-order state regression if existing state is newer
    if (existingState && incomingStateVersion < existingState.stateVersion) {
      console.warn(`[MatchReconciliationService] Rejected stale update for ${canonicalMatchId}: stateVersion ${incomingStateVersion} < current ${existingState.stateVersion}`);
      return existingState;
    }

    const ld = rawMatch.liveDetails || rawMatch.live_details || {};
    const team1Runs = Math.max(0, Number(rawMatch.team1?.runs ?? ld.runs ?? ld.firstRuns ?? ld.team1Runs ?? rawMatch.score1 ?? 0));
    const team1Wickets = Math.min(10, Math.max(0, Number(rawMatch.team1?.wickets ?? ld.wickets ?? ld.firstWickets ?? ld.team1Wickets ?? 0)));
    const team1Balls = Math.max(0, Number(rawMatch.team1?.balls ?? 0));

    const team2Runs = Math.max(0, Number(rawMatch.team2?.runs ?? ld.score2 ?? ld.chaseRuns ?? ld.team2Runs ?? 0));
    const team2Wickets = Math.min(10, Math.max(0, Number(rawMatch.team2?.wickets ?? ld.wickets2 ?? ld.chaseWickets ?? ld.team2Wickets ?? 0)));
    const team2Balls = Math.max(0, Number(rawMatch.team2?.balls ?? 0));

    const isLive = rawMatch.status === 'LIVE' || rawMatch.isLive === true || ld.isLive === true;
    const isCompleted = rawMatch.status === 'COMPLETED' || rawMatch.isFinished === true;
    const status = isLive ? 'LIVE' : (isCompleted ? 'COMPLETED' : 'SCHEDULED');

    const currentInnings = Number(rawMatch.currentInnings ?? (team2Runs > 0 || team2Balls > 0 ? 2 : 1));
    const target = rawMatch.target != null ? Number(rawMatch.target) : (currentInnings === 2 ? (team1Runs + 1) : null);

    const canonicalState = {
      canonicalMatchId,
      matchId: canonicalMatchId,
      providerMatchId: rawMatchId,
      providerId,
      sport: 'CRICKET',
      format: String(rawMatch.format || rawMatch.league || 'T20').toUpperCase(),
      status,
      team1: {
        id: team1CanonicalId,
        name: team1Name,
        runs: team1Runs,
        wickets: team1Wickets,
        balls: team1Balls,
      },
      team2: {
        id: team2CanonicalId,
        name: team2Name,
        runs: team2Runs,
        wickets: team2Wickets,
        balls: team2Balls,
      },
      currentInnings,
      target,
      stateVersion: incomingStateVersion,
      reconciledAt: new Date().toISOString(),
    };

    CANONICAL_MATCH_CACHE.set(canonicalMatchId, canonicalState);
    return canonicalState;
  }

  /**
   * Get cached canonical match state
   */
  static getCanonicalState(matchId) {
    return CANONICAL_MATCH_CACHE.get(matchId);
  }
}
