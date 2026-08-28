/**
 * Wicket settlement evidence generator (Wicket In Over, Fall of Wicket, Next Dismissal).
 */

export function generateWicketEvidence({
  bet,
  ballEvents = [],
  overSnapshot = null,
  settlementEvent = null,
  marketContext = {},
}) {
  const status = String(bet.status || '').toUpperCase();
  const selectionId = String(bet.selection_id || '').toLowerCase();
  const isYes = selectionId === 'yes' || selectionId === '1' || selectionId === 'true';
  const overNumber = marketContext.overNumber || overSnapshot?.over_number || null;
  const innings = marketContext.innings || overSnapshot?.innings || 1;

  // Filter relevant ball events for this over & innings
  const relevantBalls = (ballEvents || [])
    .filter((b) => b.innings === innings && (!overNumber || b.over_number === overNumber))
    .sort((a, b) => (Number(a.sequence_number || 0) - Number(b.sequence_number || 0)));

  const wicketBall = relevantBalls.find((b) => b.wicket === true || b.event_type === 'WICKET');
  const hasWicket = Boolean(wicketBall || (Number(overSnapshot?.wickets_in_over || 0) > 0));

  let summary = '';
  if (hasWicket && wicketBall) {
    summary = `Wicket fell at ${wicketBall.over_number}.${wicketBall.ball_number}`;
  } else if (hasWicket) {
    summary = `Wicket occurred in Over ${overNumber || ''}`.trim();
  } else {
    summary = `No wicket occurred in Over ${overNumber || ''}`.trim();
  }

  const timeline = relevantBalls.map((b) => {
    let outcomeLabel = 'No wicket';
    if (b.wicket || b.event_type === 'WICKET') {
      outcomeLabel = 'WICKET';
    } else if (b.event_type === 'FOUR') {
      outcomeLabel = '4 runs (Boundary)';
    } else if (b.event_type === 'SIX') {
      outcomeLabel = '6 runs (Six)';
    } else if (b.event_type === 'WIDE') {
      outcomeLabel = 'Wide (+1)';
    } else if (b.event_type === 'NO_BALL') {
      outcomeLabel = 'No ball (+1)';
    } else if (b.runs > 0) {
      outcomeLabel = `${b.runs} ${b.runs === 1 ? 'run' : 'runs'}`;
    }

    return {
      over: b.over_number,
      ball: b.ball_number,
      delivery: `${b.over_number}.${b.ball_number}`,
      eventType: b.event_type,
      rawLabel: b.raw_label || (b.wicket ? 'W' : (b.runs > 0 ? String(b.runs) : '•')),
      runs: b.runs || 0,
      wicket: Boolean(b.wicket),
      outcomeLabel,
      occurredAt: b.occurred_at || null,
    };
  });

  const scoreAtEvent = wicketBall ? {
    runs: overSnapshot?.runs_at_end != null ? Number(overSnapshot.runs_at_end) : null,
    wickets: overSnapshot?.wickets_at_end != null ? Number(overSnapshot.wickets_at_end) : null,
    scoreFormatted: overSnapshot?.runs_at_end != null && overSnapshot?.wickets_at_end != null
      ? `${overSnapshot.runs_at_end}/${overSnapshot.wickets_at_end}`
      : null,
  } : (overSnapshot ? {
    runs: Number(overSnapshot.runs_at_end || 0),
    wickets: Number(overSnapshot.wickets_at_end || 0),
    scoreFormatted: `${overSnapshot.runs_at_end || 0}/${overSnapshot.wickets_at_end || 0}`,
  } : null);

  const eventDetails = wicketBall ? {
    type: 'WICKET',
    delivery: `${wicketBall.over_number}.${wicketBall.ball_number}`,
    batter: wicketBall.batter || marketContext.batter || null,
    bowler: wicketBall.bowler || marketContext.bowler || null,
    dismissalType: wicketBall.wicket_type || 'OUT',
  } : null;

  return {
    evidenceVersion: settlementEvent?.settlement_version || Number(bet.settlement_version) || 1,
    evidenceStatus: relevantBalls.length > 0 || overSnapshot ? 'VERIFIED' : 'EVIDENCE_UNAVAILABLE',
    evidenceType: 'CRICKET_BALL_BY_BALL',
    source: settlementEvent?.provider ? 'VERIFIED_MATCH_EVENT_FEED' : 'CANONICAL_MATCH_STATE',
    verifiedAt: bet.settled_at || settlementEvent?.created_at || new Date().toISOString(),
    settlementReason: bet.settlement_reason || (hasWicket ? 'WICKET_IN_OVER_CONFIRMED' : 'NO_WICKET_IN_OVER_CONFIRMED'),
    summary,
    overNumber,
    innings,
    timeline,
    scoreAtEvent,
    eventDetails,
    marketResult: {
      selection: isYes ? 'YES' : 'NO',
      outcome: status,
      conditionMet: isYes ? hasWicket : !hasWicket,
    },
  };
}
