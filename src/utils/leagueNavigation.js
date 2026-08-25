import { featuredLeagues } from '../data/mockData';
import { cricketBoardActivity } from './matchFilters';

/** Alternate feed / sidebar labels that refer to the same competition. */
const LEAGUE_ALIAS_GROUPS = [
  ['cpl', 'caribbean premier league'],
  ['tnpl', 'tamil nadu premier league'],
  ['dpl', 'delhi premier league', 't20 delhi premier league'],
  ['lpl', 'lanka premier league', 't20 lanka premier league'],
  [
    'bangladesh tour of australia',
    'test series australia vs bangladesh',
    'australia vs bangladesh',
  ],
  [
    'sri lanka vs india',
    'test series sri lanka vs india',
    'india tour of sri lanka',
    'sri lanka xi vs india',
  ],
  [
    'test series west indies vs pakistan',
    'west indies v pakistan',
    'pakistan tour of west indies',
  ],
  [
    'pakistan tour of england',
    'test series england vs pakistan',
    'england vs pakistan',
  ],
  [
    't20 series sri lanka vs pakistan women',
    'pakistan women tour of sri lanka',
  ],
  [
    'kenya vs bahrain',
    't20 series kenya vs bahrain',
    'bahrain tour of kenya',
  ],
  ['the hundred', 'the hundred men', 'the hundred mens competition'],
  ['the hundred women', 'the hundred womens competition'],
];

function normalizeLeagueText(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/\(men\)|\(women\)/gi, '')
    .replace(/\b20\d{2}\b/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function aliasSetFor(normalized) {
  const keys = new Set([normalized]);
  if (!normalized) return keys;

  for (const group of LEAGUE_ALIAS_GROUPS) {
    const norms = group.map(normalizeLeagueText).filter(Boolean);
    const hit = norms.some((n) => {
      if (n === normalized) return true;
      const multi = n.split(' ').length >= 2 && normalized.split(' ').length >= 2;
      return multi && (n.includes(normalized) || normalized.includes(n));
    });
    if (hit) {
      norms.forEach((n) => keys.add(n));
    }
  }
  return keys;
}

export function textsMatch(a, b) {
  if (!a || !b) return false;
  const na = normalizeLeagueText(a);
  const nb = normalizeLeagueText(b);
  if (!na || !nb) return false;

  if (na === nb) return true;

  const aliasesA = aliasSetFor(na);
  const aliasesB = aliasSetFor(nb);
  for (const x of aliasesA) {
    for (const y of aliasesB) {
      if (x === y) return true;
    }
  }

  const wordsA = na.split(' ').filter(Boolean);
  const wordsB = nb.split(' ').filter(Boolean);

  // Short single-token labels (e.g. "india") must match exactly — aliases handled above
  if (wordsA.length === 1 || wordsB.length === 1) {
    return na === nb;
  }

  return na.includes(nb) || nb.includes(na);
}

/** True when a dynamic series name is already represented by a featured league. */
export function seriesCoveredByFeatured(series, featuredList = featuredLeagues) {
  if (!series) return false;
  const names = [series.name, series.rawName].filter(Boolean);
  return featuredList.some((league) => {
    const candidates = [league.name, league.breadcrumb, ...(league.matchLeagues || [])].filter(Boolean);
    return names.some((seriesName) =>
      candidates.some((candidate) => textsMatch(seriesName, candidate)),
    );
  });
}

/** Map sidebar label, breadcrumb text, or id → featured league id */
export function resolveLeagueId(key, cricketSeries = []) {
  if (!key || key === 'all') return 'all';

  const featuredById = featuredLeagues.find((l) => l.id === key);
  if (featuredById) return featuredById.id;

  const featuredByLabel = featuredLeagues.find(
    (l) => l.name === key
      || l.breadcrumb === key
      || l.matchLeagues?.includes(key)
      || textsMatch(l.name, key)
      || l.matchLeagues?.some((ml) => textsMatch(ml, key)),
  );
  if (featuredByLabel) return featuredByLabel.id;

  const dynamic = cricketSeries.find(
    (series) => series.id === key
      || series.name === key
      || `cb-series-${series.seriesId}` === key,
  );
  if (dynamic) {
    const featuredForSeries = featuredLeagues.find((l) =>
      textsMatch(l.name, dynamic.name)
      || textsMatch(l.name, dynamic.rawName)
      || (l.matchLeagues || []).some(
        (ml) => textsMatch(ml, dynamic.name) || textsMatch(ml, dynamic.rawName),
      ),
    );
    if (featuredForSeries) return featuredForSeries.id;
  }

  return key;
}

export function isSameLeague(activeLeague, key, cricketSeries = []) {
  if (!activeLeague || activeLeague === 'all' || !key || key === 'all') {
    return activeLeague === key;
  }
  return resolveLeagueId(activeLeague, cricketSeries) === resolveLeagueId(key, cricketSeries);
}

export function matchBelongsToLeague(match, leagueMeta) {
  if (!match || !leagueMeta) return false;

  const isSrlLeague = leagueMeta.id === 'ipl-srl' ||
    leagueMeta.id === 't20-intl-srl' ||
    String(leagueMeta.name || '').toLowerCase().includes('srl');

  const isMatchSrl = match.source === 'srl' ||
    String(match.id || '').startsWith('srl_') ||
    String(match.league || '').toLowerCase().includes('srl') ||
    String(match.seriesName || '').toLowerCase().includes('srl');

  // SRL leagues MUST ONLY match SRL matches
  if (isSrlLeague) {
    if (!isMatchSrl) return false;
    if (leagueMeta.id === 'ipl-srl'
      || leagueMeta.id === 'oddsyra-srl'
      || String(leagueMeta.name).toLowerCase().includes('oddsyra srl')) {
      // Admin-gated OddsYra SRL only — exclude external feed SRL products
      return match.source === 'srl'
        || String(match.id || '').startsWith('srl_ipl_')
        || (
          match.league === 'OddsYra SRL'
          && match.source !== '10cric2026'
          && match.source !== 'live'
          && !String(match.id || '').startsWith('10cric_')
          && !String(match.id || '').startsWith('oy_')
        );
    }
  }

  // Non-SRL leagues MUST NEVER match SRL matches
  if (isMatchSrl && !isSrlLeague) return false;

  const candidates = [
    leagueMeta.name,
    leagueMeta.breadcrumb,
    ...(leagueMeta.matchLeagues || []),
  ].filter(Boolean);

  // Compare strictly against match league/series fields — NEVER team names
  const matchFields = [
    match.league,
    match.seriesName,
  ].filter(Boolean);

  return candidates.some((candidate) =>
    matchFields.some((field) => textsMatch(field, candidate)),
  );
}

export function getLeagueMeta(leagueKey, cricketSeries = []) {
  if (!leagueKey || leagueKey === 'all') {
    return { id: 'all', name: 'All Leagues', breadcrumb: 'All Leagues', sport: 'cricket' };
  }

  const id = resolveLeagueId(leagueKey, cricketSeries);
  const staticMeta = featuredLeagues.find((league) => league.id === id);
  if (staticMeta) return staticMeta;

  const dynamic = cricketSeries.find(
    (series) => series.id === leagueKey
      || series.name === leagueKey
      || series.id === id
      || `cb-series-${series.seriesId}` === leagueKey,
  );
  if (dynamic) {
    const featuredForSeries = featuredLeagues.find((l) =>
      textsMatch(l.name, dynamic.name)
      || textsMatch(l.name, dynamic.rawName)
      || (l.matchLeagues || []).some(
        (ml) => textsMatch(ml, dynamic.name) || textsMatch(ml, dynamic.rawName),
      ),
    );
    if (featuredForSeries) return featuredForSeries;

    return {
      id: dynamic.id,
      name: dynamic.name,
      breadcrumb: dynamic.name,
      matchLeagues: [dynamic.name, dynamic.rawName].filter(Boolean),
      sport: 'cricket',
    };
  }
  return null;
}

export function canonicalLeagueName(leagueName) {
  if (!leagueName) return 'Other';

  for (const featured of featuredLeagues) {
    const candidates = [featured.name, ...(featured.matchLeagues || [])];
    if (candidates.some((c) => textsMatch(c, leagueName))) {
      return featured.name;
    }
  }

  return leagueName.replace(/,\s*20\d{2}$/, '').replace(/\s*20\d{2}$/, '').trim();
}

export function groupMatchesByLeague(matches) {
  const groups = new Map();

  for (const match of matches) {
    const key = canonicalLeagueName(match.league || match.seriesName || 'Other');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(match);
  }

  return [...groups.entries()]
    .map(([league, leagueMatches]) => ({
      league,
      matches: leagueMatches.sort((a, b) => {
        const liveA = a.matchState === 'in' ? 0 : 1;
        const liveB = b.matchState === 'in' ? 0 : 1;
        if (liveA !== liveB) return liveA - liveB;
        const actA = cricketBoardActivity(a);
        const actB = cricketBoardActivity(b);
        if (actA.started !== actB.started) return actA.started ? -1 : 1;
        if (actA.totalRuns !== actB.totalRuns) return actB.totalRuns - actA.totalRuns;
        return String(a.time || '').localeCompare(String(b.time || ''));
      }),
    }))
    .sort((a, b) => {
      const liveA = a.matches.some((m) => m.matchState === 'in') ? 0 : 1;
      const liveB = b.matches.some((m) => m.matchState === 'in') ? 0 : 1;
      if (liveA !== liveB) return liveA - liveB;
      const scoredA = a.matches.some((m) => cricketBoardActivity(m).started) ? 0 : 1;
      const scoredB = b.matches.some((m) => cricketBoardActivity(m).started) ? 0 : 1;
      if (scoredA !== scoredB) return scoredA - scoredB;
      return a.league.localeCompare(b.league);
    });
}
