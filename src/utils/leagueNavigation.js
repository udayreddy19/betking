import { featuredLeagues } from '../data/mockData';

function normalizeLeagueText(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/\(men\)|\(women\)/gi, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function textsMatch(a, b) {
  if (!a || !b) return false;
  const na = normalizeLeagueText(a);
  const nb = normalizeLeagueText(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

/** Map sidebar label, breadcrumb text, or id → featured league id */
export function resolveLeagueId(key) {
  if (!key || key === 'all') return 'all';
  const featured = featuredLeagues.find(
    (l) => l.id === key
      || l.name === key
      || l.breadcrumb === key
      || l.matchLeagues?.includes(key)
  );
  return featured?.id ?? key;
}

export function isSameLeague(activeLeague, key) {
  if (!activeLeague || activeLeague === 'all' || !key || key === 'all') {
    return activeLeague === key;
  }
  return resolveLeagueId(activeLeague) === resolveLeagueId(key);
}

export function matchBelongsToLeague(match, leagueMeta) {
  if (!match || !leagueMeta) return false;

  const candidates = [
    leagueMeta.name,
    leagueMeta.breadcrumb,
    ...(leagueMeta.matchLeagues || []),
  ].filter(Boolean);

  const matchFields = [
    match.league,
    match.seriesName,
    match.team1?.name,
    match.team2?.name,
    `${match.team1?.name || ''} vs ${match.team2?.name || ''}`,
    `${match.team1?.name || ''} v ${match.team2?.name || ''}`,
  ].filter(Boolean);

  return candidates.some((candidate) =>
    matchFields.some((field) => textsMatch(field, candidate)),
  );
}

export function getLeagueMeta(leagueKey, cricketSeries = []) {
  if (!leagueKey || leagueKey === 'all') {
    return { id: 'all', name: 'All Leagues', breadcrumb: 'All Leagues', sport: 'cricket' };
  }

  const id = resolveLeagueId(leagueKey);
  const staticMeta = featuredLeagues.find((league) => league.id === id);
  if (staticMeta) return staticMeta;

  const dynamic = cricketSeries.find(
    (series) => series.id === leagueKey || series.name === leagueKey || series.id === id,
  );
  if (dynamic) {
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

  return leagueName.replace(/,\s*2026$/, '').replace(/\s*2026$/, '').trim();
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
        return String(a.time).localeCompare(String(b.time));
      }),
    }))
    .sort((a, b) => {
      const liveA = a.matches.some((m) => m.matchState === 'in') ? 0 : 1;
      const liveB = b.matches.some((m) => m.matchState === 'in') ? 0 : 1;
      if (liveA !== liveB) return liveA - liveB;
      return a.league.localeCompare(b.league);
    });
}
