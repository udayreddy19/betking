/**
 * Enterprise Data Normalization Engine — BetKing Sportsbook (lib/dataNormalization.mjs)
 * Normalizes multi-provider team names, leagues, players, venues, and countries into
 * canonical entity IDs. Handles duplicate detection and pair key matching.
 */

const CANONICAL_TEAM_MAP = new Map([
  ['sri lanka xi', 'tm_sl_xi'],
  ['sri lanka', 'tm_sl'],
  ['india', 'tm_ind'],
  ['bangladesh', 'tm_ban'],
  ['australia', 'tm_aus'],
  ['england', 'tm_eng'],
  ['west indies', 'tm_wi'],
  ['pakistan', 'tm_pak'],
  ['delhi premier league', 'lg_dpl'],
  ['lanka premier league', 'lg_lpl'],
]);

/**
 * Normalize string entity for comparison
 */
export function normalizeEntityName(name = '') {
  return String(name)
    .toLowerCase()
    .replace(/\(men\)|\(women\)/gi, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generate canonical pair key for duplicate match detection
 */
export function generateCanonicalMatchPairKey(team1Name = '', team2Name = '') {
  const norm1 = normalizeEntityName(team1Name);
  const norm2 = normalizeEntityName(team2Name);
  if (!norm1 || !norm2) return `pair_${Date.now()}`;
  return [norm1, norm2].sort().join('|');
}

/**
 * Get canonical team ID
 */
export function getCanonicalTeamId(rawTeamName = '') {
  const norm = normalizeEntityName(rawTeamName);
  return CANONICAL_TEAM_MAP.get(norm) || `tm_${norm.replace(/\s+/g, '_')}`;
}

/**
 * Normalize match payload from external provider into canonical format
 */
export function normalizeProviderMatchPayload(rawMatch = {}, providerName = 'cricbuzz') {
  const team1Name = rawMatch.team1?.name || rawMatch.homeTeam?.name || 'Home Team';
  const team2Name = rawMatch.team2?.name || rawMatch.awayTeam?.name || 'Away Team';
  const pairKey = generateCanonicalMatchPairKey(team1Name, team2Name);

  return {
    id: rawMatch.id || `${providerName}_${Date.now()}`,
    canonicalId: `canon_${pairKey}`,
    pairKey,
    provider: providerName,
    sport: (rawMatch.sport || 'cricket').toLowerCase(),
    league: rawMatch.league || rawMatch.seriesName || 'International',
    team1: {
      id: getCanonicalTeamId(team1Name),
      name: team1Name,
      shortName: rawMatch.team1?.shortName || team1Name.slice(0, 3).toUpperCase(),
    },
    team2: {
      id: getCanonicalTeamId(team2Name),
      name: team2Name,
      shortName: rawMatch.team2?.shortName || team2Name.slice(0, 3).toUpperCase(),
    },
    matchState: rawMatch.matchState || (rawMatch.isLive ? 'in' : 'pre'),
    isLive: rawMatch.isLive || rawMatch.matchState === 'in',
    normalizedAt: new Date().toISOString(),
  };
}
