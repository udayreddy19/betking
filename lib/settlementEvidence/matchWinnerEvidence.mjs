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
  const ld = matchState?.liveDetails || {};
  const team1 = matchState?.team1 || marketContext.team1 || null;
  const team2 = matchState?.team2 || marketContext.team2 || null;

  let winningTeam = matchState?.winner || marketContext.winner || null;
  let margin = matchState?.margin || marketContext.margin || null;

  const t1Name = team1?.name || ld.firstTeamName || 'Team 1';
  const t2Name = team2?.name || ld.chaseTeamName || 'Team 2';
  const t1Runs = Number(ld.firstRuns ?? team1?.runs ?? matchState?.score1 ?? 0);
  const t1Wkts = Number(ld.firstWickets ?? team1?.wickets ?? 0);
  const t2Runs = Number(ld.chaseRuns ?? team2?.runs ?? matchState?.score2 ?? 0);
  const t2Wkts = Number(ld.chaseWickets ?? team2?.wickets ?? 0);

  if (!winningTeam && t1Runs > 0 && t2Runs > 0) {
    if (t1Runs > t2Runs) {
      winningTeam = t1Name;
      margin = `${t1Runs - t2Runs} runs`;
    } else if (t2Runs > t1Runs) {
      winningTeam = t2Name;
      margin = `${Math.max(1, 10 - t2Wkts)} wickets`;
    }
  }

  let summary = '';
  if (winningTeam && margin) {
    summary = `${winningTeam} won by ${margin}`;
  } else if (winningTeam) {
    summary = `${winningTeam} won the match`;
  } else {
    summary = `Match winner settled as ${status}`;
  }

  const team1ScoreStr = t1Runs > 0 ? `${t1Name} ${t1Runs}/${t1Wkts}` : (team1?.score ? `${t1Name}: ${team1.score}` : null);
  const team2ScoreStr = t2Runs > 0 ? `${t2Name} ${t2Runs}/${t2Wkts}` : (team2?.score ? `${t2Name}: ${team2.score}` : null);

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
      team1Score: team1ScoreStr,
      team2Score: team2ScoreStr,
      selection: bet.selection_name || bet.selection_id,
      outcome: status,
    },
  };
}
