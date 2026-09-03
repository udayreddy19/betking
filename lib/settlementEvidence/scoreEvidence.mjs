/**
 * Score settlement evidence generator (Score at Nth Wicket, Team Total Runs, Innings Score).
 */

export function generateScoreEvidence({
  bet,
  dismissalSnapshot = null,
  matchState = null,
  settlementEvent = null,
  marketContext = {},
}) {
  const status = String(bet.status || '').toUpperCase();
  const line = Number(marketContext.line || bet.line || 0);
  const isUnder = String(bet.selection_id || '').toLowerCase().includes('under')
    || String(bet.selection_name || '').toLowerCase().includes('under');

  const reason = String(bet.settlement_reason || settlementEvent?.settlement_reason || '').toLowerCase();
  const reasonScoreMatch = reason.match(/score=(\d+)/i)
    || reason.match(/_final=(\d+)/i)
    || reason.match(/final=(\d+)/i)
    || reason.match(/runs?=(\d+)/i);
  const reasonLineMatch = reason.match(/_line=(\d+\.?\d*)/i) || reason.match(/line=(\d+\.?\d*)/i);
  const reasonWktsMatch = reason.match(/dismissal_(\d+)/i) || reason.match(/wicket_(\d+)/i) || reason.match(/wkts?=(\d+)/i);
  const effectiveLine = Number.isFinite(line) && line > 0
    ? line
    : (reasonLineMatch ? Number(reasonLineMatch[1]) : 0);

  const finalScore = dismissalSnapshot?.runs != null
    ? Number(dismissalSnapshot.runs)
    : (matchState?.totalScore != null
      ? Number(matchState.totalScore)
      : (reasonScoreMatch ? Number(reasonScoreMatch[1]) : null));

  const wickets = dismissalSnapshot?.wicketNumber != null
    ? Number(dismissalSnapshot.wicketNumber)
    : (matchState?.wickets != null
      ? Number(matchState.wickets)
      : (reasonWktsMatch ? Number(reasonWktsMatch[1]) : null));

  const overs = dismissalSnapshot?.overs || matchState?.overs || null;

  let summary = '';
  if (finalScore != null && effectiveLine > 0) {
    summary = `Final score was ${finalScore} (Line: ${effectiveLine} — ${finalScore < effectiveLine ? 'UNDER' : 'OVER'})`;
  } else if (finalScore != null) {
    summary = `Score reached ${finalScore}${wickets != null ? `/${wickets}` : ''}`;
  } else {
    summary = `Score market settled as ${status}`;
  }

  return {
    evidenceVersion: settlementEvent?.settlement_version || Number(bet.settlement_version) || 1,
    evidenceStatus: finalScore != null || dismissalSnapshot ? 'VERIFIED' : 'EVIDENCE_UNAVAILABLE',
    evidenceType: 'SCORE_MILESTONE',
    source: settlementEvent?.provider ? 'VERIFIED_MATCH_EVENT_FEED' : 'CANONICAL_MATCH_STATE',
    verifiedAt: bet.settled_at || settlementEvent?.created_at || new Date().toISOString(),
    settlementReason: bet.settlement_reason || `score=${finalScore}_line=${effectiveLine}`,
    summary,
    scoreAtEvent: {
      runs: finalScore,
      wickets,
      overs,
      scoreFormatted: finalScore != null ? `${finalScore}${wickets != null ? `/${wickets}` : ''}` : null,
    },
    eventDetails: dismissalSnapshot ? {
      playerDismissed: dismissalSnapshot.player || marketContext.player || null,
      dismissalType: dismissalSnapshot.dismissalType || null,
      over: dismissalSnapshot.overs,
    } : null,
    marketResult: {
      score: finalScore,
      line: effectiveLine > 0 ? effectiveLine : null,
      selection: isUnder ? 'UNDER' : 'OVER',
      outcome: status,
    },
  };
}
