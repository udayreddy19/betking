/** Deterministic odds per match — stable across poll refreshes. */
export function getStableMatchOdds(matchId, { hasDraw = false } = {}) {
  const seed = [...matchId].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const team1 = Number((1.35 + (seed % 90) / 100).toFixed(2));
  const team2 = Number((1.35 + ((seed * 13) % 95) / 100).toFixed(2));
  const odds = { team1, team2 };
  if (hasDraw) {
    odds.draw = Number((2.6 + ((seed * 3) % 80) / 100).toFixed(2));
  }
  return odds;
}

export function safeNum(value, fallback = 0) {
  const n = typeof value === 'number' ? value : parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}
