import { useMemo, useRef, useSyncExternalStore } from 'react';
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
  const isLive = match?.matchState === 'in' || match?.isLive;

  if (match && pollable && isLive) {
    prefetchMatchDetail(match);
  }

  const detailVersion = useSyncExternalStore(
    (onStoreChange) => (matchId && pollable
      ? subscribeMatchDetailStore(matchId, onStoreChange)
      : () => {}),
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
  }, [match, matchId, detailVersion, isLive, pollable]);
}
