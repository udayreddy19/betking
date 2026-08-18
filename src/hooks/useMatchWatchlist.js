import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  WATCHLIST_CHANGED_EVENT,
  isOnWatchlist,
  loadWatchlist,
  toggleWatchlistMatch,
} from '../utils/favorites.js';

export function useMatchWatchlist() {
  const [items, setItems] = useState(() => loadWatchlist());

  useEffect(() => {
    const refresh = () => setItems(loadWatchlist());
    window.addEventListener(WATCHLIST_CHANGED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(WATCHLIST_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const toggle = useCallback((match) => {
    const next = toggleWatchlistMatch(match);
    setItems(next);
    return next;
  }, []);

  const ids = useMemo(() => items.map((item) => item.id), [items]);
  const idSet = useMemo(() => new Set(ids), [ids]);

  return {
    items,
    ids,
    count: items.length,
    isSaved: (id) => isOnWatchlist(id, items) || idSet.has(String(id)),
    toggle,
  };
}
