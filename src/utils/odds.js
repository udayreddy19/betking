/** Deterministic odds helper — DEPRECATED for display. Prefer OddsEngineV3 / provider odds. */
export function getStableMatchOdds() {
  return { team1: null, team2: null, draw: null };
}

export function safeNum(value, fallback = 0) {
  const n = typeof value === 'number' ? value : parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}
