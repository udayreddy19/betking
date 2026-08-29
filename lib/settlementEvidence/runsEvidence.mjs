/**
 * Runs settlement evidence generator (Over Runs, Next Delivery Runs, Boundary In Over).
 */

export function generateRunsEvidence({
  bet,
  ballEvents = [],
  overSnapshot = null,
  settlementEvent = null,
  marketContext = {},
}) {
  const reason = String(bet.settlement_reason || settlementEvent?.settlement_reason || '').toLowerCase();
  const reasonRunsMatch = reason.match(/runs?=(\d+)/i) || reason.match(/score=(\d+)/i);
  const parsedRuns = reasonRunsMatch ? Number(reasonRunsMatch[1]) : null;
  const reasonLineMatch = reason.match(/line=(\d+(?:\.\d+)?)/i);
  const line = reasonLineMatch ? Number(reasonLineMatch[1]) : Number(marketContext.line || bet.line || 0);
  const reasonOverMatch = reason.match(/milestone_(\d+)/i) || reason.match(/over_(\d+)/i);
  const overNumber = marketContext.overNumber || (reasonOverMatch ? Number(reasonOverMatch[1]) : null) || overSnapshot?.over_num || overSnapshot?.over_number || null;
  const innings = marketContext.innings || overSnapshot?.innings || 1;
  const isOver = String(bet.selection_id || '').toLowerCase().includes('over') || String(bet.selection_name || '').toLowerCase().includes('over');

  const relevantBalls = (ballEvents || [])
    .filter((b) => b.innings === innings && (!overNumber || b.over_number === overNumber))
    .sort((a, b) => (Number(a.sequence_number || 0) - Number(b.sequence_number || 0)));

  const totalRuns = overSnapshot?.runs_in_over != null
    ? Number(overSnapshot.runs_in_over)
    : (parsedRuns != null ? parsedRuns : relevantBalls.reduce((sum, b) => sum + Number(b.runs || 0), 0));

  let timeline = relevantBalls.map((b) => ({
    over: b.over_number,
    ball: b.ball_number,
    delivery: `${b.over_number}.${b.ball_number}`,
    eventType: b.event_type,
    rawLabel: b.raw_label || String(b.runs || 0),
    runs: Number(b.runs || 0),
    wicket: Boolean(b.wicket),
    outcomeLabel: b.wicket ? 'Wicket' : `${b.runs} ${b.runs === 1 ? 'run' : 'runs'}`,
  }));

  if (timeline.length === 0 && (totalRuns != null || reason)) {
    timeline = [
      {
        over: overNumber || 1,
        ball: 1,
        delivery: overNumber ? `Over ${overNumber}` : 'Full Over',
        eventType: 'RUNS',
        rawLabel: String(totalRuns || 0),
        runs: Number(totalRuns || 0),
        wicket: false,
        outcomeLabel: `Over ${overNumber || ''} completed: ${totalRuns} runs scored${line > 0 ? ` (Line: ${line})` : ''}`.trim(),
        occurredAt: bet.settled_at || null,
      },
    ];
  }

  const summary = line > 0
    ? `Total ${totalRuns} runs scored in Over ${overNumber || ''} (Line: ${line})`
    : `Total ${totalRuns} runs scored in Over ${overNumber || ''}`;

  return {
    evidenceVersion: settlementEvent?.settlement_version || Number(bet.settlement_version) || 1,
    evidenceStatus: timeline.length > 0 || overSnapshot || parsedRuns != null ? 'VERIFIED' : 'EVIDENCE_UNAVAILABLE',
    evidenceType: 'CRICKET_BALL_BY_BALL',
    source: settlementEvent?.provider ? 'VERIFIED_MATCH_EVENT_FEED' : 'CANONICAL_MATCH_STATE',
    verifiedAt: bet.settled_at || settlementEvent?.created_at || new Date().toISOString(),
    settlementReason: bet.settlement_reason || `over_${overNumber}_runs=${totalRuns}_line=${line}`,
    summary: summary.trim(),
    overNumber,
    innings,
    totalRuns,
    line: line > 0 ? line : null,
    timeline,
    scoreAtEvent: overSnapshot ? {
      runs: Number(overSnapshot.score_at_end || overSnapshot.runs_at_end || 0),
      wickets: Number(overSnapshot.wickets_at_end || 0),
      scoreFormatted: `${overSnapshot.score_at_end || overSnapshot.runs_at_end || 0}/${overSnapshot.wickets_at_end || 0}`,
    } : null,
    marketResult: {
      total: totalRuns,
      line: line > 0 ? line : null,
      selection: isOver ? 'OVER' : 'UNDER',
      outcome: status,
    },
  };
}
