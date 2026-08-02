import { useState, useEffect } from 'react';
import { enrichMatchWithDetail } from '../utils/matchDetailEnrich';

const DETAIL_CACHE = new Map();
const CACHE_TTL_MS = 12_000;

async function fetchMatchDetail(matchId) {
  const cached = DETAIL_CACHE.get(matchId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data;
  }

  const res = await fetch(`/api/match-detail?id=${matchId}`);
  if (!res.ok) throw new Error(`Match detail failed (${res.status})`);
  const data = await res.json();
  DETAIL_CACHE.set(matchId, { data, at: Date.now() });
  return data;
}

export function useMatchDetail(match) {
  const [enrichedMatch, setEnrichedMatch] = useState(match);
  const [isLoading, setIsLoading] = useState(false);

  const matchId = match?.cricbuzzMatchId || (
    match?.id?.startsWith('cb_') ? match.id.replace('cb_', '') : null
  );

  useEffect(() => {
    setEnrichedMatch(match);

    if (!match || !matchId) return undefined;
    if (match.sport !== 'cricket' && match.sport !== 'virtual-cricket') return undefined;

    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      try {
        const detail = await fetchMatchDetail(matchId);
        if (!cancelled && detail) {
          setEnrichedMatch(enrichMatchWithDetail(match, detail));
        }
      } catch (err) {
        console.warn('Match detail fetch failed:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    const interval = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [match, matchId]);

  return { match: enrichedMatch, isLoading };
}
