import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { enrichMatchWithDetail } from '../utils/matchDetailEnrich';
import {
  prefetchMatchDetail,
  subscribeMatchDetailStore,
  getMatchDetailSnapshot,
  getMatchDetailVersion,
  enrichFromPoller,
  canPoll,
} from '../services/matchDetailPoller';

export function useMatchDetail(match) {
  const matchRef = useRef(match);
  matchRef.current = match;

  const matchId = match?.id;
  const pollable = canPoll(match);

  useEffect(() => {
    if (matchRef.current && pollable) {
      prefetchMatchDetail(matchRef.current, { priority: true });
    }
  }, [matchId, pollable]);

  const detailVersion = useSyncExternalStore(
    (onStoreChange) => {
      if (!matchId || !pollable) return () => {};
      const current = matchRef.current;
      return subscribeMatchDetailStore(matchId, onStoreChange, current);
    },
    () => (matchId ? getMatchDetailVersion(matchId) : 0),
    () => 0,
  );

  return useMemo(() => {
    const base = matchRef.current;
    if (!base) return base;

    const detail = matchId ? getMatchDetailSnapshot(matchId) : null;
    if (detail) {
      return enrichMatchWithDetail(base, detail);
    }
    return enrichFromPoller(base) || base;
  }, [match, matchId, detailVersion, pollable]);
}
