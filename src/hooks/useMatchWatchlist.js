import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../utils/apiClient';
import {
  WATCHLIST_CHANGED_EVENT,
  isOnWatchlist,
  loadWatchlist,
  saveWatchlist,
  toggleWatchlistMatch,
} from '../utils/favorites.js';

function matchIdFromFollowRow(row) {
  return String(row?.match_id || row?.matchId || '');
}

export function useMatchWatchlist() {
  const { isLoggedIn } = useAuth();
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

  useEffect(() => {
    if (!isLoggedIn) return undefined;
    let cancelled = false;

    (async () => {
      try {
        const res = await apiFetch('/api/v1/user/follows');
        if (!res.ok || cancelled) return;
        const data = await res.json().catch(() => ({}));
        const follows = Array.isArray(data.follows) ? data.follows : [];
        const current = loadWatchlist();
        const byId = new Map(current.map((item) => [String(item.id), item]));
        const serverIds = new Set();
        let changed = false;

        for (const row of follows) {
          const id = matchIdFromFollowRow(row);
          if (!id) continue;
          serverIds.add(id);
          if (byId.has(id)) continue;
          changed = true;
          byId.set(id, {
            id,
            sport: '',
            league: '',
            team1: '',
            team2: '',
            savedAt: row.created_at || new Date().toISOString(),
          });
        }

        // Push local-only items up so the watchlist survives device switch.
        const localOnly = current.filter((item) => item?.id && !serverIds.has(String(item.id)));
        await Promise.allSettled(
          localOnly.map((item) => apiFetch('/api/v1/user/follows', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ matchId: String(item.id) }),
          })),
        );

        if (cancelled) return;
        if (changed) {
          const merged = saveWatchlist(Array.from(byId.values()));
          setItems(merged);
        }
      } catch {
        /* keep local watchlist */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  const toggle = useCallback((match) => {
    const id = match?.id != null ? String(match.id) : String(match?.matchId || '');
    const wasSaved = id ? isOnWatchlist(id) : false;
    const next = toggleWatchlistMatch(match);
    setItems(next);

    if (isLoggedIn && id) {
      (async () => {
        try {
          if (wasSaved) {
            await apiFetch(`/api/v1/user/follows/${encodeURIComponent(id)}`, { method: 'DELETE' });
          } else {
            await apiFetch('/api/v1/user/follows', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ matchId: id }),
            });
          }
        } catch {
          /* local watchlist remains source of truth offline */
        }
      })();
    }

    return next;
  }, [isLoggedIn]);

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
