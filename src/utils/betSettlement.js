/**
 * Demo bet settlement — resolves pending bets when matches finish.
 */

function parseScore(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return value;
  const str = String(value);
  const runs = str.split('/')[0];
  const n = parseFloat(runs);
  return Number.isFinite(n) ? n : 0;
}

/** @returns {'1'|'2'|'X'|null} */
export function getMatchWinner(match) {
  if (!match) return null;
  const state = match.matchState || (match.isLive ? 'in' : 'pre');
  if (state !== 'post' && state !== 'completed') return null;

  const ld = match.liveDetails || {};
  const s1 = parseScore(ld.score1 ?? ld.runs);
  const s2 = parseScore(ld.score2 ?? ld.runs2 ?? ld.score2);

  if (s1 > s2) return '1';
  if (s2 > s1) return '2';
  if (match.sport === 'soccer' || match.sport === 'esoccer') return 'X';
  return '1';
}

/** @returns {boolean|null} null = not ready to settle */
export function isLegWinner(leg, match) {
  const winner = getMatchWinner(match);
  if (!winner) return null;

  if (['1', '2', 'X'].includes(leg.selection)) {
    return leg.selection === winner;
  }

  if (leg.selection === 'over' || leg.selection === 'under') {
    const total = parseScore(match.liveDetails?.runs) + parseScore(match.liveDetails?.runs2);
    const line = 0.5;
    if (leg.selection === 'over') return total > line;
    return total <= line;
  }

  const seed = `${leg.id}-${match.id}`.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return seed % 3 !== 0;
}

export function settlePlacedBet(placed, matchesById) {
  if (placed.status !== 'pending') return placed;

  const legResults = placed.legs.map((leg) => {
    const match = matchesById.get(leg.matchId);
    if (!match) return { leg, result: null };
    return { leg, result: isLegWinner(leg, match) };
  });

  if (legResults.some(({ result }) => result === null)) {
    return placed;
  }

  const allWon = legResults.every(({ result }) => result === true);
  const status = allWon ? 'won' : 'lost';
  const payout = allWon ? placed.potentialReturn : 0;

  return {
    ...placed,
    status,
    payout,
    settledAt: new Date().toISOString(),
  };
}

export function settleAllPlacedBets(placedBets, matches) {
  const matchesById = new Map(matches.map((m) => [m.id, m]));
  let changed = false;
  const next = placedBets.map((placed) => {
    const settled = settlePlacedBet(placed, matchesById);
    if (settled !== placed && settled.status !== placed.status) changed = true;
    return settled;
  });
  return { bets: next, changed };
}
