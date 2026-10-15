import { featuredLeagues as staticFeaturedLeagues } from '../data/mockData';
import { canonicalLeagueName, textsMatch } from './leagueNavigation';

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function matchSportKey(match) {
  const s = String(match?.sport || '').toLowerCase();
  if (s === 'football') return 'soccer';
  if (s === 'tabletennis') return 'table-tennis';
  if (s === 'nfl') return 'american-football';
  return s;
}

/**
 * Home league chips: prefer leagues that actually exist in the live API feed for the active sport,
 * and fall back to the static `featuredLeagues` catalogue only when the feed has nothing for it.
 *
 * Returns chip metas shaped like `featuredLeagues` entries ({ id, name, sport, icon, matchLeagues }).
 */
export function buildHomeLeagueChips(matches, activeSport, {
  limit = 4,
  featured = staticFeaturedLeagues,
} = {}) {
  const list = Array.isArray(matches) ? matches : [];
  const groups = new Map();

  for (const match of list) {
    if (activeSport !== 'all' && matchSportKey(match) !== activeSport) continue;
    const raw = match?.league || match?.seriesName;
    if (!raw) continue;
    const name = canonicalLeagueName(raw);
    if (!name || name === 'Other') continue;
    const group = groups.get(name) || { name, raws: new Set(), live: 0, total: 0, sport: matchSportKey(match) };
    group.raws.add(raw);
    group.total += 1;
    if (String(match.matchState || '').toLowerCase() === 'in') group.live += 1;
    groups.set(name, group);
  }

  const live = [...groups.values()]
    .sort((a, b) => (b.live - a.live) || (b.total - a.total) || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((group) => {
      const known = featured.find((f) => textsMatch(f.name, group.name)
        || (f.matchLeagues || []).some((ml) => textsMatch(ml, group.name)));
      if (known) return known;
      return {
        id: `live-${slugify(group.name)}`,
        name: group.name,
        sport: group.sport,
        icon: 'flame',
        matchLeagues: [...group.raws],
        breadcrumb: group.name,
      };
    });

  if (live.length > 0) return live;
  return featured.filter((l) => activeSport === 'all' || l.sport === activeSport).slice(0, limit);
}
