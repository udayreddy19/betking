/** Canonical pair key so Cricbuzz, ESPN, FanCode, and the client merge the same fixture. */

/** ICC / common codes → full names so "SL" and "Sri Lanka" share one pair key. */
const PAIR_TEAM_ALIASES = {
  sl: 'sri lanka',
  ind: 'india',
  india: 'india',
  aus: 'australia',
  eng: 'england',
  pak: 'pakistan',
  ban: 'bangladesh',
  afg: 'afghanistan',
  nz: 'new zealand',
  sa: 'south africa',
  rsa: 'south africa',
  wi: 'west indies',
  ire: 'ireland',
  zim: 'zimbabwe',
  ned: 'netherlands',
  sco: 'scotland',
  nam: 'namibia',
  nep: 'nepal',
  oma: 'oman',
  uae: 'united arab emirates',
  usa: 'united states',
};

export function normalizeTeamNameForPair(name = '') {
  let normalized = String(name)
    .toLowerCase()
    .replace(/\(men\)|\(women\)/gi, '')
    .replace(/\bwomen\b/gi, '')
    .replace(/\bmen\b/gi, '')
    .replace(/\bxi\b/gi, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const alias = PAIR_TEAM_ALIASES[normalized] || PAIR_TEAM_ALIASES[normalized.replace(/\s+/g, '')];
  if (alias) return alias;
  return normalized;
}

export function getCanonicalMatchPairKey(match) {
  const t1 = normalizeTeamNameForPair(
    match?.team1?.name || match?.homeTeam?.teamName || match?.homeTeam?.name,
  );
  const t2 = normalizeTeamNameForPair(
    match?.team2?.name || match?.awayTeam?.teamName || match?.awayTeam?.name,
  );
  if (!t1 || !t2) return String(match?.id || '');
  const blob = [
    t1,
    t2,
    match?.team1?.name,
    match?.team2?.name,
    match?.league,
    match?.seriesName,
    match?.id,
  ].filter(Boolean).join(' ').toLowerCase();
  const gender = /\bwomen\b|\(women\)/.test(blob) ? 'w' : 'm';
  const srl = /\bsrl\b/.test(blob) || String(match?.id || '').startsWith('srl_') ? 'srl' : 'real';
  return `${gender}|${srl}|${[t1, t2].sort().join('|')}`;
}

/** Higher number wins. Cricket: Cricbuzz → CREX → FanCode → 10Cric → ESPN. */
export const CRICKET_SOURCE_PRIORITY = {
  cricbuzz: 50,
  crex: 40,
  fancode: 30,
  '10cric2026': 20,
  '10cric': 20,
  espn: 10,
};

export function cricketSourceRank(match) {
  const src = String(match?.source || match?.provider || '').toLowerCase();
  if (src === '10cric') return CRICKET_SOURCE_PRIORITY['10cric2026'];
  return CRICKET_SOURCE_PRIORITY[src] || 0;
}

export function cricketScoreWeight(match) {
  const ld = match?.liveDetails || {};
  return [
    ld.runs,
    ld.score2,
    ld.firstRuns,
    ld.chaseRuns,
    ld.score1,
    ld.wickets,
    ld.wickets2,
    ld.firstWickets,
    ld.chaseWickets,
  ].reduce((sum, value) => sum + (Number(value) || 0), 0);
}
