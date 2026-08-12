/**
 * OddsEngine V2 / V3 Shadow Runner & Comparison Engine
 * 
 * Runs OddsEngineV3 in parallel with OddsEngineV2 for every match state evaluation.
 * Logs shadow comparison results without affecting production V2 responses.
 */

import { generate as generateV3 } from '../OddsEngineV3.mjs';
import { createCanonicalMatchState } from '../models/CanonicalMatchState.mjs';

const SHADOW_LOG_STORE = [];
const MAX_SHADOW_LOGS = 500;

/**
 * Runs V3 snapshot generator and logs comparison metrics.
 * 
 * @param {Object} matchData - Raw or normalized match data
 * @returns {{ v3Snapshot: Object, shadowComparison: Object[] }}
 */
export function runShadowComparison(matchData) {
  let v3Snapshot = null;
  let comparisonEntries = [];

  try {
    const isHundred = String(matchData.format || matchData.league || '').toLowerCase().includes('hundred');
    const format = isHundred ? 'THE_HUNDRED' : 'T20';
    const ballsPerInnings = format === 'THE_HUNDRED' ? 100 : 120;

    const ld = matchData.liveDetails || matchData.live_details || {};
    const team1Runs = Number(matchData.team1?.runs ?? ld.team1Runs ?? 142);
    const team1Wickets = Number(matchData.team1?.wickets ?? ld.team1Wickets ?? 5);
    const team1Balls = Number(matchData.team1?.balls ?? ld.team1Balls ?? ballsPerInnings);

    const team2Runs = Number(matchData.team2?.runs ?? ld.team2Runs ?? 98);
    const team2Wickets = Number(matchData.team2?.wickets ?? ld.team2Wickets ?? 3);
    const team2Balls = Number(matchData.team2?.balls ?? ld.team2Balls ?? 58);

    const target = Number(matchData.target ?? (team1Runs + 1));
    const currentInnings = Number(matchData.currentInnings ?? 2);
    const battingTeamId = matchData.battingTeamId || matchData.team2?.id || 'team2';
    const bowlingTeamId = matchData.bowlingTeamId || matchData.team1?.id || 'team1';
    const ballsCompleted = currentInnings === 2 ? team2Balls : team1Balls;
    const ballsRemaining = Math.max(0, ballsPerInnings - ballsCompleted);

    const canonicalState = createCanonicalMatchState({
      matchId: matchData.id || matchData.matchId || 'match_1',
      sport: 'CRICKET',
      format,
      status: matchData.status === 'LIVE' ? 'LIVE' : (matchData.status === 'COMPLETED' ? 'COMPLETED' : 'SCHEDULED'),
      team1: {
        id: matchData.team1?.id || 'team1',
        name: matchData.team1?.name || matchData.team1 || 'Team 1',
        runs: team1Runs,
        wickets: team1Wickets,
        balls: team1Balls,
      },
      team2: {
        id: matchData.team2?.id || 'team2',
        name: matchData.team2?.name || matchData.team2 || 'Team 2',
        runs: team2Runs,
        wickets: team2Wickets,
        balls: team2Balls,
      },
      currentInnings,
      battingTeamId,
      bowlingTeamId,
      target,
      runsRequired: Math.max(0, target - team2Runs),
      ballsPerInnings,
      ballsCompleted,
      ballsRemaining,
      providerTimestamp: Date.now(),
      stateVersion: Number(matchData.stateVersion || v2Snapshot?.stateVersion || 1),
    });

    // Step 3: Execute V3
    v3Snapshot = generateV3(canonicalState, { debug: false });

    // Step 4: Compare V2 vs V3 outputs
    const timestamp = Date.now();
    const matchId = canonicalState.matchId;
    const stateVersion = canonicalState.stateVersion;

    const v2WinnerMarket = v2Snapshot?.markets?.find(m => m.key === 'winner' || m.marketId === 'match_winner');
    const v3WinnerMarket = v3Snapshot?.markets?.find(m => m.marketType === 'MATCH_WINNER');

    if (v2WinnerMarket && v3WinnerMarket) {
      for (const v3Sel of v3WinnerMarket.selections || []) {
        const v2Opt = v2WinnerMarket.options?.find(o => o.name === v3Sel.name || o.selection === v3Sel.selectionId);
        const v2Odds = v2Opt ? Number(v2Opt.odds) : null;
        const v3Odds = Number(v3Sel.odds);
        const diff = v2Odds != null ? Math.abs(v3Odds - v2Odds) : null;

        const entry = {
          matchId,
          stateVersion,
          marketId: 'match_winner',
          selectionId: v3Sel.selectionId,
          selectionName: v3Sel.name,
          V2: {
            probability: v2Opt?.probability || null,
            fairOdds: v2Opt?.fairOdds || null,
            finalOdds: v2Odds,
          },
          V3: {
            probability: v3Sel.probability,
            fairOdds: v3Sel.fairOdds,
            finalOdds: v3Odds,
          },
          difference: diff != null ? Number(diff.toFixed(4)) : null,
          timestamp,
        };

        comparisonEntries.push(entry);
        SHADOW_LOG_STORE.push(entry);
        if (SHADOW_LOG_STORE.length > MAX_SHADOW_LOGS) SHADOW_LOG_STORE.shift();
      }
    }
  } catch (err) {
    console.error('[OddsShadowRunner] Error running V3 shadow mode:', err.message);
  }

  return {
    v3Snapshot,
    shadowComparison: comparisonEntries,
  };
}

export function getShadowLogs() {
  return [...SHADOW_LOG_STORE];
}
