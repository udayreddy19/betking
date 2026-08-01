import { useState, useEffect } from 'react';
import { fetchMatchPlayers } from '../services/playerStatsService';

export function useMatchPlayers(match) {
  const [data, setData] = useState({
    players: [],
    source: 'none',
    loading: false,
    refreshing: false,
    error: null,
  });

  useEffect(() => {
    if (!match) {
      setData({ players: [], source: 'none', loading: false, refreshing: false, error: null });
      return;
    }

    let cancelled = false;
    setData(prev => ({
      ...prev,
      loading: prev.players.length === 0,
      refreshing: prev.players.length > 0,
      error: null,
    }));

    fetchMatchPlayers(match)
      .then(result => {
        if (!cancelled) {
          setData({ ...result, loading: false, refreshing: false, error: null });
        }
      })
      .catch(err => {
        if (!cancelled) {
          setData(prev => ({
            players: prev.players,
            source: prev.source,
            loading: false,
            refreshing: false,
            error: err.message,
          }));
        }
      });

    return () => { cancelled = true; };
  }, [match?.id, match?.league, match?.liveDetails?.runs, match?.espn?.eventId, match?.cricbuzz?.matchId]);

  return data;
}
