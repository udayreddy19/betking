const FAV_KEY = 'betking_favorite_matches';

export function loadFavoriteMatchIds() {
  try {
    const raw = JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
    return Array.isArray(raw) ? raw.map(String) : [];
  } catch {
    return [];
  }
}

export function saveFavoriteMatchIds(ids) {
  localStorage.setItem(FAV_KEY, JSON.stringify([...new Set(ids.map(String))].slice(0, 80)));
}

export function toggleFavoriteMatchId(id) {
  const ids = loadFavoriteMatchIds();
  const key = String(id);
  const next = ids.includes(key) ? ids.filter((x) => x !== key) : [key, ...ids];
  saveFavoriteMatchIds(next);
  return next;
}

export function isFavoriteMatchId(id, ids = loadFavoriteMatchIds()) {
  return ids.includes(String(id));
}
