import { useState, useEffect, useRef } from 'react';
import { enrichMatchWithDetail } from '../utils/matchDetailEnrich';
import { subscribeMatchDetail, enrichFromPoller } from '../services/matchDetailPoller';

export function useMatchDetail(match) {
  const matchRef = useRef(match);
  matchRef.current = match;

  const [enrichedMatch, setEnrichedMatch] = useState(() => enrichFromPoller(match) || match);

  // Apply list-API score updates immediately
  useEffect(() => {
    setEnrichedMatch(enrichFromPoller(matchRef.current) || match);
  }, [match]);

  const matchId = match?.cricbuzzMatchId || (
    match?.id?.startsWith('cb_') ? match.id.replace('cb_', '') : null
  );

  // Subscribe to shared poller — won't restart when match object identity changes
  useEffect(() => {
    if (!match || !matchId) return undefined;
    if (match.sport !== 'cricket' && match.sport !== 'virtual-cricket') return undefined;

    return subscribeMatchDetail(match, (detail) => {
      setEnrichedMatch(enrichMatchWithDetail(matchRef.current, detail));
    });
  }, [matchId, match?.sport, match?.matchState, match?.isLive]);

  return { match: enrichedMatch };
}
