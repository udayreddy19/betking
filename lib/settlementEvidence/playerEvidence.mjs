/**
 * Player Milestone / Prop settlement evidence generator (Player Runs, Top Batter, Player Wickets).
 */

export function generatePlayerEvidence({
  bet,
  playerStats = null,
  settlementEvent = null,
  marketContext = {},
}) {
  const status = String(bet.status || '').toUpperCase();
  const playerName = playerStats?.name || marketContext.playerName || bet.selection_name || null;
  const target = Number(marketContext.target || bet.line || 0);
  const actualScore = playerStats?.runs != null ? Number(playerStats.runs) : (playerStats?.wickets != null ? Number(playerStats.wickets) : null);
  const ballsFaced = playerStats?.balls != null ? Number(playerStats.balls) : null;
  const isDismissed = Boolean(playerStats?.isDismissed);

  let summary = '';
  if (playerName && actualScore != null && target > 0) {
    summary = `${playerName} scored ${actualScore} runs (Target: ${target})`;
  } else if (playerName && actualScore != null) {
    summary = `${playerName}: ${actualScore} ${playerStats?.wickets != null ? 'wickets' : 'runs'}`;
  } else {
    summary = `Player market settled as ${status}`;
  }

  return {
    evidenceVersion: settlementEvent?.settlement_version || Number(bet.settlement_version) || 1,
    evidenceStatus: playerStats || actualScore != null ? 'VERIFIED' : 'EVIDENCE_UNAVAILABLE',
    evidenceType: 'PLAYER_STATISTICS',
    source: settlementEvent?.provider ? 'VERIFIED_MATCH_EVENT_FEED' : 'CANONICAL_MATCH_STATE',
    verifiedAt: bet.settled_at || settlementEvent?.created_at || new Date().toISOString(),
    settlementReason: bet.settlement_reason || `player_score=${actualScore}_target=${target}`,
    summary,
    playerStats: {
      name: playerName,
      runs: playerStats?.runs != null ? Number(playerStats.runs) : null,
      ballsFaced,
      wickets: playerStats?.wickets != null ? Number(playerStats.wickets) : null,
      isDismissed,
    },
    marketResult: {
      target: target > 0 ? target : null,
      actual: actualScore,
      selection: bet.selection_name || bet.selection_id,
      outcome: status,
    },
  };
}
