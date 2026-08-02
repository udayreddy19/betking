/**
 * Shared live match detail poller — one interval per match, survives parent re-renders.
 */
import { enrichMatchWithDetail } from '../utils/matchDetailEnrich';

const LIVE_POLL_MS = 2000;
const IDLE_POLL_MS = 15000;

/** @type {Map<string, { detail: object|null, listeners: Set<Function>, timer: any, inflight: Promise<any>|null }>} */
const pollers = new Map();

async function fetchDetail(matchId) {
  const res = await fetch(`/api/match-detail?id=${matchId}&_=${Date.now()}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Match detail failed (${res.status})`);
  return res.json();
}

function getMatchId(match) {
  if (!match) return null;
  return match.cricbuzzMatchId || (match.id?.startsWith('cb_') ? match.id.replace('cb_', '') : null);
}

function startPoller(matchId, isLive) {
  if (pollers.has(matchId)) return;

  const state = {
    detail: null,
    listeners: new Set(),
    timer: null,
    inflight: null,
    isLive,
  };
  pollers.set(matchId, state);

  const poll = async () => {
    const s = pollers.get(matchId);
    if (!s) return;

    if (!s.inflight) {
      s.inflight = fetchDetail(matchId)
        .then((detail) => {
          s.detail = detail;
          s.listeners.forEach((fn) => fn(detail));
        })
        .catch((err) => console.warn('Match detail poll failed:', err))
        .finally(() => {
          s.inflight = null;
        });
    }

    await s.inflight;
  };

  poll();
  const pollMs = isLive ? LIVE_POLL_MS : IDLE_POLL_MS;
  state.timer = setInterval(poll, pollMs);
}

function stopPoller(matchId) {
  const s = pollers.get(matchId);
  if (!s) return;
  clearInterval(s.timer);
  pollers.delete(matchId);
}

export function prefetchMatchDetail(match) {
  const matchId = getMatchId(match);
  if (!matchId) return;
  if (match.sport !== 'cricket' && match.sport !== 'virtual-cricket') return;
  const isLive = match.matchState === 'in' || match.isLive;
  if (!pollers.has(matchId)) {
    startPoller(matchId, isLive);
  }
}

export function subscribeMatchDetail(match, listener) {
  const matchId = getMatchId(match);
  if (!matchId) return () => {};

  const isLive = match?.matchState === 'in' || match?.isLive;
  if (!pollers.has(matchId)) {
    startPoller(matchId, isLive);
  }

  const state = pollers.get(matchId);
  state.listeners.add(listener);

  if (state.detail) {
    listener(state.detail);
  }

  return () => {
    state.listeners.delete(listener);
    if (state.listeners.size === 0) {
      stopPoller(matchId);
    }
  };
}

export function enrichFromPoller(match) {
  const matchId = getMatchId(match);
  if (!matchId) return match;
  const state = pollers.get(matchId);
  if (!state?.detail) return match;
  return enrichMatchWithDetail(match, state.detail);
}
