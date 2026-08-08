import { useSyncExternalStore } from 'react';
import { centralizedMatchEngine } from '../services/centralizedMatchStateEngine';

/**
 * Custom React Hook providing a single canonical MatchState snapshot.
 * Ensures zero UI-level score calculations across all components.
 */
export function useCentralizedMatchState(match) {
  const matchId = match?.id;

  return useSyncExternalStore(
    (onStoreChange) => {
      if (!matchId) return () => {};
      return centralizedMatchEngine.subscribe(matchId, onStoreChange);
    },
    () => (matchId ? centralizedMatchEngine.getSnapshot(matchId) : null),
    () => null
  );
}
