/**
 * Generic settlement evidence generator for non-cricket or unspecialized markets.
 */

export function generateGenericEvidence({
  bet,
  settlementEvent = null,
  matchState = null,
}) {
  const status = String(bet.status || '').toUpperCase();
  const reason = bet.settlement_reason || settlementEvent?.settlement_reason || null;
  const verifiedAt = bet.settled_at || settlementEvent?.created_at || new Date().toISOString();

  let summary = `Bet settled as ${status}`;
  if (reason) {
    summary = `Settled as ${status} (${reason})`;
  }

  return {
    evidenceVersion: settlementEvent?.settlement_version || Number(bet.settlement_version) || 1,
    evidenceStatus: status === 'PENDING' ? 'PENDING' : 'VERIFIED',
    evidenceType: 'GENERIC_SUMMARY',
    source: settlementEvent?.provider ? 'VERIFIED_PROVIDER_FEED' : 'INTERNAL_SETTLEMENT_LOG',
    verifiedAt,
    settlementReason: reason,
    summary,
    matchState: matchState ? {
      score: matchState.score,
      status: matchState.status,
      period: matchState.period,
    } : null,
    details: {
      marketId: bet.market_id,
      selectionId: bet.selection_id,
      acceptedOdds: Number(bet.accepted_odds || bet.odds || 1.0),
      actualPayout: Number(bet.actual_payout || 0),
    },
  };
}
