/**
 * Shared betslip odds-change state — single handler for placement rejections.
 */

export const ODDS_STATUS = {
  UNCHANGED: 'UNCHANGED',
  CHANGED: 'ODDS_CHANGED',
  ACCEPTED: 'ACCEPTED',
};

/** Normalize API odds update payloads into a consistent shape. */
export function normalizeOddsUpdates(apiPayload = {}) {
  const raw = apiPayload.changedSelections
    || apiPayload.oddsUpdates
    || apiPayload.data?.selections
    || (apiPayload.data ? [apiPayload.data] : []);
  const list = Array.isArray(raw) ? raw : [raw];
  return list.filter(Boolean).map((row) => ({
    matchId: row.matchId,
    marketId: row.marketId,
    selectionId: row.selectionId,
    selectionName: row.selectionName || null,
    oldOdds: Number(row.oldOdds ?? row.previousOdds),
    newOdds: Number(row.newOdds ?? row.odds),
    odds: Number(row.newOdds ?? row.odds),
    oddsVersion: row.oddsVersion ?? null,
    quoteTimestamp: row.quoteTimestamp ?? null,
    requiresAcceptance: row.requiresAcceptance !== false,
  })).filter((row) => (
    row.matchId && row.selectionId && Number.isFinite(row.newOdds)
  ));
}

export function isOddsChangedResponse(payload = {}) {
  const code = String(payload.code || '').toUpperCase();
  return code === 'ODDS_CHANGED' || code === 'STALE_ODDS';
}

export function isNonAcceptableMarketError(payload = {}) {
  const code = String(payload.code || '').toUpperCase();
  return [
    'MARKET_SUSPENDED',
    'MARKET_CLOSED',
    'MARKET_ALREADY_DETERMINED',
    'SELECTION_UNAVAILABLE',
    'MATCH_SUSPENDED',
    'ODDS_UNAVAILABLE',
    'ODDS_LOCKED',
    'ODDS_EXPIRED',
  ].includes(code);
}

function betMatchesUpdate(bet, update) {
  const sel = bet.selection || bet.selectionId;
  return bet.matchId === update.matchId
    && (sel === update.selectionId || bet.selectionId === update.selectionId);
}

/** Apply server odds-change payload to betslip rows without removing selections. */
export function applyOddsChangedToBets(currentBets = [], updates = []) {
  if (!updates.length) return currentBets;
  return currentBets.map((bet) => {
    const hit = updates.find((u) => betMatchesUpdate(bet, u));
    if (!hit) return bet;
    const oldOdds = Number(hit.oldOdds ?? bet.odds);
    const newOdds = Number(hit.newOdds ?? hit.odds);
    if (!Number.isFinite(newOdds)) return bet;
    return {
      ...bet,
      previousOdds: Number.isFinite(oldOdds) ? oldOdds : bet.odds,
      odds: newOdds,
      oddsChanged: true,
      oddsStatus: ODDS_STATUS.CHANGED,
      oddsVersion: hit.oddsVersion ?? bet.oddsVersion ?? null,
      quoteTimestamp: hit.quoteTimestamp ?? bet.quoteTimestamp ?? null,
      ...(hit.marketId ? { marketId: hit.marketId } : {}),
      ...(hit.selectionId ? { selection: hit.selectionId, selectionId: hit.selectionId } : {}),
    };
  });
}

/** User explicitly accepted the current server odds for one selection. */
export function acceptOddsForBet(bet) {
  if (!bet) return bet;
  return {
    ...bet,
    odds: Number(bet.odds),
    oddsChanged: false,
    oddsStatus: ODDS_STATUS.ACCEPTED,
    previousOdds: undefined,
    acceptedOdds: Number(bet.odds),
    acceptedAt: new Date().toISOString(),
  };
}

export function acceptAllChangedOdds(bets = []) {
  return bets.map((bet) => (
    bet.oddsStatus === ODDS_STATUS.CHANGED ? acceptOddsForBet(bet) : bet
  ));
}

export function hasPendingOddsAcceptance(bets = []) {
  return bets.some((bet) => bet.oddsStatus === ODDS_STATUS.CHANGED);
}

export function formatOddsChangeAnnouncement(bet) {
  if (!bet || bet.oddsStatus !== ODDS_STATUS.CHANGED) return '';
  const oldPrice = Number(bet.previousOdds ?? bet.oldOdds);
  const newPrice = Number(bet.odds);
  if (!Number.isFinite(oldPrice) || !Number.isFinite(newPrice)) return 'Odds changed.';
  return `Odds changed from ${oldPrice.toFixed(2)} to ${newPrice.toFixed(2)}.`;
}

export function formatOddsChangeDisplay(bet) {
  const oldPrice = Number(bet?.previousOdds ?? bet?.oldOdds);
  const newPrice = Number(bet?.odds);
  if (!Number.isFinite(newPrice)) return '';
  if (bet?.oddsStatus !== ODDS_STATUS.CHANGED || !Number.isFinite(oldPrice)) {
    return newPrice.toFixed(2);
  }
  return `${oldPrice.toFixed(2)} → ${newPrice.toFixed(2)}`;
}

/** Handle placement API rejection — returns updated bets + flags for UI. */
export function handleOddsChangedResponse(currentBets, apiPayload = {}) {
  const updates = normalizeOddsUpdates(apiPayload);
  if (!updates.length) {
    return {
      bets: currentBets,
      oddsUpdated: false,
      requiresAcceptance: false,
      updates: [],
    };
  }
  return {
    bets: applyOddsChangedToBets(currentBets, updates),
    oddsUpdated: true,
    requiresAcceptance: true,
    updates,
    code: String(apiPayload.code || 'ODDS_CHANGED').toUpperCase(),
    message: apiPayload.message || apiPayload.error || 'The odds have changed.',
  };
}
