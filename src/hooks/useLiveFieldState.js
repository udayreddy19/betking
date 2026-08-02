import { useState, useEffect, useRef } from 'react';
import {
  buildRosterFallback,
  createFieldState,
  tickFieldState,
  needsResync,
  syncFieldStateFromMatch,
} from '../utils/liveFieldState';

const TICK_MS = 5000;

function isApiBackedMatch(match) {
  if (!match) return false;
  return !!(
    match.cricbuzzMatchId
    || match.id?.startsWith('cb_')
    || match.source === 'cricbuzz'
    || match.source === 'espn'
    || match.id?.startsWith('api_')
    || match.fancodeMatchId
  );
}

export function useLiveFieldState(match, roster) {
  const [fieldState, setFieldState] = useState(() => {
    if (!match) return null;
    const r = roster || buildRosterFallback(match.team1?.name || 'Team 1');
    return createFieldState(match, r);
  });
  const stateRef = useRef(fieldState);
  const rosterRef = useRef(roster);

  rosterRef.current = roster;

  const ld = match?.liveDetails;

  // Sync when API scores / overs / batters change
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
  }, [
    match,
    match?.id,
    ld?.runs,
    ld?.score2,
    ld?.chaseRuns,
    ld?.firstRuns,
    ld?.overs,
    ld?.overs2,
    ld?.chaseOvers,
    ld?.wickets,
    ld?.wickets2,
    ld?.batter1?.runs,
    ld?.batter1?.balls,
    ld?.batter2?.runs,
    ld?.batter2?.balls,
    ld?.batter1?.name,
    ld?.batter2?.name,
    ld?.bowler?.name,
  ]);

  // Only simulate balls for mock matches — API-backed matches use real score sync
  useEffect(() => {
    if (!match || isApiBackedMatch(match)) return undefined;

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

    const bootTimer = setTimeout(tick, 1200);
    const interval = setInterval(tick, TICK_MS);

    return () => {
      clearTimeout(bootTimer);
      clearInterval(interval);
    };
  }, [match?.id, match?.matchState, match?.isLive, match?.cricbuzzMatchId, match?.source]);

  return fieldState;
}
