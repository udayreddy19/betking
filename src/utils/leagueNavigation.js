import { featuredLeagues } from '../data/mockData';

/** Map sidebar label, breadcrumb text, or id → featured league id */
export function resolveLeagueId(key) {
  if (!key) return null;
  const featured = featuredLeagues.find(
    l => l.id === key
      || l.name === key
      || l.breadcrumb === key
      || l.matchLeagues?.includes(key)
  );
  return featured?.id ?? key;
}

export function isSameLeague(activeLeague, key) {
  return resolveLeagueId(activeLeague) === resolveLeagueId(key);
}

export function getLeagueMeta(leagueKey, cricketSeries = []) {
  const id = resolveLeagueId(leagueKey);
  const staticMeta = featuredLeagues.find((league) => league.id === id);
  if (staticMeta) return staticMeta;

  const dynamic = cricketSeries.find(
    (series) => series.id === leagueKey || series.name === leagueKey || series.id === id
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
