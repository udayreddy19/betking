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

export function getLeagueMeta(leagueKey) {
  const id = resolveLeagueId(leagueKey);
  return featuredLeagues.find(l => l.id === id) || null;
}
