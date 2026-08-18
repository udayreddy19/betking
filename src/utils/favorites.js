import { storageGet, storageSet } from './browserCompat.js';
import { teamDisplayName } from './teamShortName.js';

const FAV_KEY = 'oddsyra_favorite_matches';
const WATCHLIST_KEY = 'oddsyra_match_watchlist_v1';
export const WATCHLIST_CHANGED_EVENT = 'oddsyra:watchlist-changed';
const MAX_ITEMS = 80;

function notifyWatchlistChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(WATCHLIST_CHANGED_EVENT));
  }
}

function matchId(matchOrId) {
  if (matchOrId && typeof matchOrId === 'object') {
    return String(matchOrId.id || matchOrId.matchId || '');
  }
  return String(matchOrId || '');
}

function snapshotFromMatch(match) {
  const id = matchId(match);
  const team1 = teamDisplayName(match?.team1, 'Team 1');
  const team2 = teamDisplayName(match?.team2, 'Team 2');
  return {
    id,
    sport: match?.sport || '',
    league: match?.league || '',
    team1,
    team2,
    savedAt: new Date().toISOString(),
  };
}

export function loadFavoriteMatchIds() {
  return loadWatchlist().map((item) => item.id);
}

export function loadWatchlist() {
  try {
    const raw = JSON.parse(storageGet(WATCHLIST_KEY) || 'null');
    if (Array.isArray(raw) && raw.length > 0 && raw[0] && typeof raw[0] === 'object') {
      return raw
        .map((item) => ({
          id: String(item.id || ''),
          sport: item.sport || '',
          league: item.league || '',
          team1: item.team1 || '',
          team2: item.team2 || '',
          savedAt: item.savedAt || '',
        }))
        .filter((item) => item.id)
        .slice(0, MAX_ITEMS);
    }
  } catch {
    // fall through to legacy key
  }

  try {
    const legacy = JSON.parse(storageGet(FAV_KEY) || '[]');
    if (Array.isArray(legacy) && legacy.length) {
      return legacy.map((id) => ({
        id: String(id),
        sport: '',
        league: '',
        team1: '',
        team2: '',
        savedAt: '',
      })).filter((item) => item.id).slice(0, MAX_ITEMS);
    }
  } catch {
    // ignore
  }
  return [];
}

export function saveWatchlist(items) {
  const next = [];
  const seen = new Set();
  for (const item of items) {
    const id = String(item?.id || '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    next.push({
      id,
      sport: item.sport || '',
      league: item.league || '',
      team1: item.team1 || '',
      team2: item.team2 || '',
      savedAt: item.savedAt || new Date().toISOString(),
    });
    if (next.length >= MAX_ITEMS) break;
  }
  storageSet(WATCHLIST_KEY, JSON.stringify(next));
  storageSet(FAV_KEY, JSON.stringify(next.map((item) => item.id)));
  notifyWatchlistChanged();
  return next;
}

export function saveFavoriteMatchIds(ids) {
  const current = loadWatchlist();
  const byId = new Map(current.map((item) => [item.id, item]));
  return saveWatchlist((ids || []).map((id) => byId.get(String(id)) || { id: String(id) }));
}

export function toggleWatchlistMatch(match) {
  const id = matchId(match);
  if (!id) return loadWatchlist();
  const current = loadWatchlist();
  const exists = current.some((item) => item.id === id);
  const next = exists
    ? current.filter((item) => item.id !== id)
    : [snapshotFromMatch(match), ...current];
  return saveWatchlist(next);
}

export function toggleFavoriteMatchId(id) {
  return toggleWatchlistMatch({ id }).map((item) => item.id);
}

export function isFavoriteMatchId(id, ids = loadFavoriteMatchIds()) {
  return ids.includes(String(id));
}

export function isOnWatchlist(id, items = loadWatchlist()) {
  return items.some((item) => item.id === String(id));
}
