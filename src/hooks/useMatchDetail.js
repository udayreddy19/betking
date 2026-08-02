import { useState, useEffect, useRef } from 'react';
import { enrichMatchWithDetail } from '../utils/matchDetailEnrich';

const LIVE_POLL_MS = 4000;
const INFLIGHT = new Map();

async function fetchMatchDetail(matchId) {
  const existing = INFLIGHT.get(matchId);
  if (existing) return existing;

  const promise = fetch(`/api/match-detail?id=${matchId}&_=${Date.now()}`, {
    cache: 'no-store',
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`Match detail failed (${res.status})`);
      return res.json();
    })
    .finally(() => {
      INFLIGHT.delete(matchId);
    });

  INFLIGHT.set(matchId, promise);
  return promise;
}

export function useMatchDetail(match) {
  const [enrichedMatch, setEnrichedMatch] = useState(match);
  const matchRef = useRef(match);
  const detailRef = useRef(null);
  const matchIdRef = useRef(null);

  matchRef.current = match;

  const matchId = match?.cricbuzzMatchId || (
    match?.id?.startsWith('cb_') ? match.id.replace('cb_', '') : null
  );

  // Merge list-API score updates without wiping detail-enriched state
  useEffect(() => {
    if (detailRef.current) {
      setEnrichedMatch(enrichMatchWithDetail(matchRef.current, detailRef.current));
    } else {
      setEnrichedMatch(match);
    }
  }, [match]);

  // Fast poll Cricbuzz match page for live scores + player names
  useEffect(() => {
    if (!match || !matchId) {
      detailRef.current = null;
      matchIdRef.current = null;
      return undefined;
    }

    if (match.sport !== 'cricket' && match.sport !== 'virtual-cricket') {
      return undefined;
    }

    const isLive = match.matchState === 'in' || match.isLive;
    const pollMs = isLive ? LIVE_POLL_MS : 15000;

    if (matchIdRef.current !== matchId) {
      detailRef.current = null;
      matchIdRef.current = matchId;
    }

    let cancelled = false;
    let timer;

    const load = async () => {
      try {
        const detail = await fetchMatchDetail(matchId);
        if (cancelled) return;
        detailRef.current = detail;
        setEnrichedMatch(enrichMatchWithDetail(matchRef.current, detail));
      } catch (err) {
        console.warn('Match detail fetch failed:', err);
      } finally {
        if (!cancelled) {
          timer = setTimeout(load, pollMs);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [match, matchId, match?.matchState, match?.isLive]);

  return { match: enrichedMatch };
}
