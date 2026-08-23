/**
 * Non-sensitive audit log for odds-change rejections at placement.
 */

export function logOddsChangeRejection({
  userId,
  matchId,
  marketId,
  selectionId,
  previousOdds,
  currentOdds,
  oddsVersion = null,
  betType = 'SINGLE',
  code = 'ODDS_CHANGED',
  correlationId = null,
}) {
  const payload = {
    event: 'odds_change_rejection',
    code,
    result: code,
    userId: userId || null,
    matchId: matchId || null,
    marketId: marketId || null,
    selectionId: selectionId || null,
    previousOdds: formatAuditOdds(previousOdds),
    currentOdds: formatAuditOdds(currentOdds),
    oddsVersion: oddsVersion || null,
    betType,
    correlationId: correlationId || null,
    timestamp: new Date().toISOString(),
  };
  console.info('[OddsChange]', JSON.stringify(payload));
  return payload;
}

function formatAuditOdds(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : null;
}
