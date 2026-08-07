/**
 * Enterprise Favorites Engine — BetKing Sportsbook (lib/favoritesEngine.mjs)
 * Manages user followed sports, teams, players, markets, and competitions.
 * Generates personalized homepage feed views.
 */

const USER_FAVORITES_STORE = new Map();

export function toggleUserFavorite(userId, entityType, entityId) {
  let userFavs = USER_FAVORITES_STORE.get(userId) || {
    sports: new Set(),
    teams: new Set(),
    markets: new Set(),
  };

  const set = userFavs[entityType] || new Set();
  if (set.has(entityId)) {
    set.delete(entityId);
  } else {
    set.add(entityId);
  }
  userFavs[entityType] = set;
  USER_FAVORITES_STORE.set(userId, userFavs);

  return {
    userId,
    favorites: {
      sports: Array.from(userFavs.sports),
      teams: Array.from(userFavs.teams),
      markets: Array.from(userFavs.markets),
    },
  };
}

export function getUserFavorites(userId) {
  const userFavs = USER_FAVORITES_STORE.get(userId) || { sports: new Set(), teams: new Set(), markets: new Set() };
  return {
    userId,
    sports: Array.from(userFavs.sports),
    teams: Array.from(userFavs.teams),
    markets: Array.from(userFavs.markets),
  };
}
