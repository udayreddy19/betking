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

  const sel = String(leg.selectionName || leg.selection || '');
  const t1 = match.team1?.name || '';
  const t2 = match.team2?.name || '';
  if (t1 && (sel.toLowerCase().includes(String(t1).toLowerCase().slice(0, 3)) || String(leg.selection).toLowerCase().includes('t1'))) {
    return winner === '1';
  }
  if (t2 && (sel.toLowerCase().includes(String(t2).toLowerCase().slice(0, 3)) || String(leg.selection).toLowerCase().includes('t2'))) {
    return winner === '2';
  }

  return null;
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

/**
 * MODULE 7: Enterprise Cashout Engine
 * Calculates Live Cashout, Partial Cashout, and Auto Cashout thresholds.
 */
export function calculateLiveCashoutValue(placedBet, currentLiveOdds = 2.0, houseMarginPct = 4.0) {
  if (!placedBet || placedBet.status !== 'pending') {
    return { available: false, cashoutValue: 0, reason: 'Bet is not active' };
  }

  const stake = Number(placedBet.stake || placedBet.amount || 0);
  const originalOdds = Number(placedBet.odds || placedBet.totalOdds || 1.0);
  const potentialPayout = stake * originalOdds;
  const currentOdds = Math.max(1.01, Number(currentLiveOdds) || 2.0);

  // Fair Cashout = Potential Payout / Current Live Odds
  const fairCashout = potentialPayout / currentOdds;
  const marginDeduction = 1 - (houseMarginPct / 100);
  let finalCashout = fairCashout * marginDeduction;

  // Cap cashout between 10% of stake and 98% of potential payout
  const minCashout = stake * 0.10;
  const maxCashout = potentialPayout * 0.98;
  finalCashout = Math.max(minCashout, Math.min(maxCashout, finalCashout));

  return {
    available: true,
    cashoutValue: Number(finalCashout.toFixed(2)),
    fairCashout: Number(fairCashout.toFixed(2)),
    stake,
    potentialPayout,
    currentLiveOdds: currentOdds,
    calculatedAt: new Date().toISOString(),
  };
}

export function calculatePartialCashout(placedBet, currentLiveOdds, cashoutPercentage = 50, houseMarginPct = 4.0) {
  const fullQuote = calculateLiveCashoutValue(placedBet, currentLiveOdds, houseMarginPct);
  if (!fullQuote.available) return fullQuote;

  const pct = Math.max(10, Math.min(90, Number(cashoutPercentage) || 50)) / 100;
  const partialCashoutValue = Number((fullQuote.cashoutValue * pct).toFixed(2));
  const remainingStake = Number((placedBet.stake * (1 - pct)).toFixed(2));

  return {
    available: true,
    partialCashoutValue,
    remainingStake,
    cashoutPercentage: pct * 100,
    fullCashoutValue: fullQuote.cashoutValue,
  };
}

export function evaluateAutoCashout(placedBet, currentLiveOdds, targetCashoutThreshold) {
  const quote = calculateLiveCashoutValue(placedBet, currentLiveOdds);
  if (!quote.available) return { shouldExecute: false };

  const target = Number(targetCashoutThreshold);
  const shouldExecute = quote.cashoutValue >= target;

  return {
    shouldExecute,
    currentCashoutValue: quote.cashoutValue,
    targetThreshold: target,
  };
}

