/**
 * Match Winner settlement evidence generator.
 */

export function generateMatchWinnerEvidence({
  bet,
  matchState = null,
  settlementEvent = null,
  marketContext = {},
}) {
  const status = String(bet.status || '').toUpperCase();
  const winningTeam = matchState?.winner || marketContext.winner || null;
  const margin = matchState?.margin || marketContext.margin || null;
  const team1 = matchState?.team1 || marketContext.team1 || null;
  const team2 = matchState?.team2 || marketContext.team2 || null;

  let summary = '';
  if (winningTeam && margin) {
    summary = `${winningTeam} won by ${margin}`;
  } else if (winningTeam) {
    summary = `${winningTeam} won the match`;
  } else {
    summary = `Match winner settled as ${status}`;
  }

  return {
    evidenceVersion: settlementEvent?.settlement_version || Number(bet.settlement_version) || 1,
    evidenceStatus: winningTeam || matchState ? 'VERIFIED' : 'EVIDENCE_UNAVAILABLE',
    evidenceType: 'MATCH_RESULT',
    source: settlementEvent?.provider ? 'VERIFIED_MATCH_EVENT_FEED' : 'CANONICAL_MATCH_STATE',
    verifiedAt: bet.settled_at || settlementEvent?.created_at || new Date().toISOString(),
    settlementReason: bet.settlement_reason || `winner_${winningTeam || 'determined'}`,
    summary,
    matchResult: {
      winner: winningTeam,
      margin,
      team1Score: team1 ? `${team1.name || 'Team 1'}: ${team1.score || team1.runs || ''}` : null,
      team2Score: team2 ? `${team2.name || 'Team 2'}: ${team2.score || team2.runs || ''}` : null,
      selection: bet.selection_name || bet.selection_id,
      outcome: status,
    },
  };
}
