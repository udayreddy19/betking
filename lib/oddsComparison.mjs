/**
 * Canonical odds price comparison for placement validation.
 * Avoids unsafe float equality (1.850 === 1.85) while detecting real price moves.
 */

const ODDS_DECIMAL_PLACES = 2;

/** Normalize to fixed decimal string for comparison (e.g. 1.850 → "1.85"). */
export function normalizeOddsPrice(odds) {
  const n = Number(odds);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toFixed(ODDS_DECIMAL_PLACES);
}

/** True when two prices represent the same bettable decimal odds. */
export function oddsPricesEqual(a, b) {
  const left = normalizeOddsPrice(a);
  const right = normalizeOddsPrice(b);
  if (left == null || right == null) return false;
  return left === right;
}

/** Detect whether server odds differ from the user's accepted/client odds. */
export function detectOddsChange(serverOdds, clientOdds) {
  const server = normalizeOddsPrice(serverOdds);
  const client = clientOdds != null && clientOdds !== ''
    ? normalizeOddsPrice(clientOdds)
    : null;
  if (server == null) {
    return { changed: false, oldOdds: client, newOdds: null, oddsChanged: false };
  }
  if (client == null) {
    return {
      changed: false,
      oldOdds: null,
      newOdds: server,
      oddsChanged: false,
    };
  }
  const changed = server !== client;
  return {
    changed,
    oddsChanged: changed,
    oldOdds: client,
    newOdds: server,
  };
}

/** Relative drift beyond permitted window — potential tampering, not a normal price move. */
export function isStaleOddsDrift(serverOdds, clientOdds, maxDriftPct = null) {
  const server = Number(serverOdds);
  const client = Number(clientOdds);
  if (!Number.isFinite(server) || server <= 0 || !Number.isFinite(client)) return false;
  const maxDrift = maxDriftPct ?? Number(process.env.MAX_ODDS_DRIFT_PCT ?? 0.25);
  if (maxDrift <= 0) return false;
  return Math.abs(server - client) / server > maxDrift;
}

export function formatOddsForClient(odds) {
  const normalized = normalizeOddsPrice(odds);
  return normalized ?? String(odds);
}
