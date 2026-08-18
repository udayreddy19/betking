import { describe, it, expect, beforeEach, vi } from 'vitest';

const store = new Map();

vi.mock('../../src/utils/browserCompat.js', () => ({
  storageGet: (key) => (store.has(key) ? store.get(key) : null),
  storageSet: (key, value) => {
    store.set(key, value);
    return true;
  },
}));

const {
  loadWatchlist,
  saveWatchlist,
  toggleWatchlistMatch,
  isOnWatchlist,
  loadFavoriteMatchIds,
} = await import('../../src/utils/favorites.js');

describe('match watchlist', () => {
  beforeEach(() => {
    store.clear();
  });

  it('saves a match snapshot and toggles it off', () => {
    const match = {
      id: 'm1',
      sport: 'cricket',
      league: 'IPL',
      team1: { name: 'MI' },
      team2: { name: 'CSK' },
    };
    const added = toggleWatchlistMatch(match);
    expect(added).toHaveLength(1);
    expect(added[0].team1).toBe('MI');
    expect(isOnWatchlist('m1')).toBe(true);
    expect(loadFavoriteMatchIds()).toEqual(['m1']);

    const removed = toggleWatchlistMatch(match);
    expect(removed).toHaveLength(0);
    expect(isOnWatchlist('m1')).toBe(false);
  });

  it('reads nested team name objects', () => {
    const added = toggleWatchlistMatch({
      id: 'm2',
      team1: { name: { label: 'CSK' } },
      team2: { name: { label: 'MI' } },
    });
    expect(added[0].team1).toBe('CSK');
    expect(added[0].team2).toBe('MI');
  });

  it('keeps newest first and caps length', () => {
    saveWatchlist(Array.from({ length: 85 }, (_, i) => ({ id: `m${i}` })));
    expect(loadWatchlist()).toHaveLength(80);
  });

  it('migrates legacy id arrays', () => {
    store.set('oddsyra_favorite_matches', JSON.stringify(['old-1', 'old-2']));
    const items = loadWatchlist();
    expect(items.map((item) => item.id)).toEqual(['old-1', 'old-2']);
  });
});
