import { useState, useEffect, useRef } from 'react';
import {
  buildRosterFallback,
  createFieldState,
  tickFieldState,
  needsResync,
  syncFieldStateFromMatch,
} from '../utils/liveFieldState';

const TICK_MS = 5000;

export function useLiveFieldState(match, roster) {
  const [fieldState, setFieldState] = useState(() => {
    if (!match) return null;
    const r = roster || buildRosterFallback(match.team1?.name || 'Team 1');
    return createFieldState(match, r);
  });
  const stateRef = useRef(fieldState);
  const rosterRef = useRef(roster);

  rosterRef.current = roster;

  // Sync when match or API scores change
  useEffect(() => {
    if (!match) {
      stateRef.current = null;
      setFieldState(null);
      return;
    }

    const r = rosterRef.current || buildRosterFallback(match.team1?.name || 'Team 1');

    if (needsResync(stateRef.current, match)) {
      const next = syncFieldStateFromMatch(stateRef.current, match, r);
      stateRef.current = next;
      setFieldState(next);
    } else if (!stateRef.current) {
      const next = createFieldState(match, r);
      stateRef.current = next;
      setFieldState(next);
    }
  }, [match]);

  // Auto-tick ball-by-ball while live
  useEffect(() => {
    if (!match) return undefined;

    const isLive = match.matchState === 'in' || match.isLive;
    if (!isLive) return undefined;

    const tick = () => {
      const r = rosterRef.current || buildRosterFallback(match.team1?.name || 'Team 1');
      if (!stateRef.current) {
        stateRef.current = createFieldState(match, r);
      }
      const next = tickFieldState(stateRef.current, match, r);
      stateRef.current = next;
      setFieldState({ ...next });
    };

    // First ball shortly after opening the Field tab / selecting a live match
    const bootTimer = setTimeout(tick, 1200);
    const interval = setInterval(tick, TICK_MS);

    return () => {
      clearTimeout(bootTimer);
      clearInterval(interval);
    };
  }, [match?.id, match?.matchState, match?.isLive]);

  return fieldState;
}
