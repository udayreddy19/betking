const CACHE_TTL_MS = 3 * 60 * 1000;
const cache = new Map();

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function cacheSet(key, data) {
  cache.set(key, { data, ts: Date.now() });
}

async function apiGet(params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`/api/cricbuzz?${qs}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Cricbuzz proxy ${res.status}`);
  }
  return res.json();
}

/**
 * Fetch parsed players for a match via Cricbuzz scorecard.
 * @param {object} match
 */
export async function fetchCricbuzzPlayers(match) {
  const cricbuzz = match?.cricbuzz || {};
  const cacheKey = `cb:${cricbuzz.matchId || ''}:${match?.team1?.name}:${match?.team2?.name}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const params = { type: 'players' };
  if (cricbuzz.matchId) {
    params.matchId = String(cricbuzz.matchId);
  } else if (match?.team1?.name && match?.team2?.name) {
    params.team1 = match.team1.name;
    params.team2 = match.team2.name;
  } else {
    return null;
  }

  const data = await apiGet(params);
  if (!data?.players?.length) return null;

  cacheSet(cacheKey, data);
  return data;
}

export async function resolveCricbuzzMatchId(team1, team2) {
  const data = await apiGet({ type: 'resolve', team1, team2 });
  return data?.matchId || null;
}
