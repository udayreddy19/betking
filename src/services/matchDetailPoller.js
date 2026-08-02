/**
 * Shared live match detail poller — all sports, continuous fetch, instant React sync.
 */
import { enrichMatchWithDetail } from '../utils/matchDetailEnrich';
import { mergeCricketLiveDetails, mergeCricketPlayersOnly } from '../utils/cricketScoreMerge';
import { MATCH_DETAIL_LIVE_POLL_MS, MATCH_DETAIL_IDLE_POLL_MS } from '../config/livePolling';

const LIVE_GAP_MS = MATCH_DETAIL_LIVE_POLL_MS;
const IDLE_GAP_MS = MATCH_DETAIL_IDLE_POLL_MS;
const MAX_POLLERS = 3;

/** @type {Map<string, { match: object, detail: object|null, version: number, listeners: Set<Function>, running: boolean, isLive: boolean, priority: boolean }>} */
const pollers = new Map();

function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

function detailFingerprint(detail) {
  if (!detail) return '';
  const ld = detail.liveDetails || {};
  return [
    detail.isLive,
    detail.matchState,
    detail.time,
    ld.runs,
    ld.wickets,
    ld.overs,
    ld.score2,
    ld.wickets2,
    ld.overs2,
    ld.firstRuns,
    ld.chaseRuns,
    ld.firstWickets,
    ld.chaseWickets,
    ld.chaseBallNbr,
    ld.batter1?.name,
    ld.batter2?.name,
    ld.bowler?.name,
    ld.commentary,
    (ld.currentOverBalls || []).join(','),
    detail.squads?.length ?? 0,
    detail.scorecardInnings?.length ?? 0,
    detail.overHistory?.length ?? 0,
  ].join(':');
}

function emit(key, detail) {
  const state = pollers.get(key);
  if (!state) return;
  if (state.detail && detailFingerprint(state.detail) === detailFingerprint(detail)) {
    return;
  }
  state.detail = detail;
  state.version += 1;
  state.listeners.forEach((fn) => fn());
}

function getPollerKey(match) {
  return match?.id || null;
}

function canPoll(match) {
  if (!match?.id) return false;
  if (match.cricbuzzMatchId || match.id.startsWith('cb_')) return true;
  if (match.source === 'espn' || match.id.startsWith('api_')) return true;
  if (match.espnEventId && match.espnPath) return true;
  if (match.fancodeMatchId) return true;
  return false;
}

function buildDetailUrl(match, fast) {
  const params = new URLSearchParams({
    matchId: match.id,
    sport: match.sport || '',
    source: match.source || '',
    fast: fast ? '1' : '0',
  });

  if (match.league) params.set('league', match.league);
  if (match.cricbuzzMatchId) params.set('cricbuzzMatchId', String(match.cricbuzzMatchId));
  if (match.espnEventId) params.set('espnEventId', String(match.espnEventId));
  if (match.espnPath) params.set('espnPath', match.espnPath);
  if (match.fancodeMatchId) params.set('fancodeMatchId', String(match.fancodeMatchId));

  return `/api/match-detail?${params}`;
}

async function fetchDetail(match, fast) {
  const res = await fetch(buildDetailUrl(match, fast), { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Match detail failed (${res.status})`);
  return res.json();
}

function mergeDetails(prev, next, { isFull = false, match = null } = {}) {
  if (!prev) return next;
  if (!next) return prev;

  const prevLd = prev.liveDetails || {};
  const nextLd = next.liveDetails || {};
  const isCricket = !!(nextLd.chaseRuns != null || nextLd.firstRuns != null || nextLd.runs != null);

  let liveDetails;
  const hasCommData = !!(nextLd.batter1 || nextLd.currentOverBalls?.length
    || nextLd.chaseBallNbr != null || nextLd.firstRuns != null || nextLd.chaseRuns != null);
  if (isFull && isCricket && !hasCommData) {
    liveDetails = mergeCricketPlayersOnly(prevLd, nextLd);
  } else if (isCricket) {
    liveDetails = mergeCricketLiveDetails(prevLd, nextLd, match);
  } else {
    liveDetails = { ...prevLd, ...nextLd };
  }

  return {
    ...next,
    fetchedAt: next.fetchedAt || prev.fetchedAt,
    isLive: next.isLive ?? prev.isLive,
    matchState: next.matchState ?? prev.matchState,
    time: next.time ?? prev.time,
    squads: next.squads ?? prev.squads,
    scorecardInnings: next.scorecardInnings ?? prev.scorecardInnings,
    overHistory: next.overHistory?.length ? next.overHistory : prev.overHistory,
    liveDetails: {
      ...liveDetails,
      batter1: liveDetails.batter1 || prevLd.batter1,
      batter2: liveDetails.batter2 || prevLd.batter2,
      bowler: liveDetails.bowler || prevLd.bowler,
    },
  };
}

async function pollLoop(key) {
  const state = pollers.get(key);
  if (!state || state.running) return;
  state.running = true;

  while (pollers.has(key)) {
    const s = pollers.get(key);
    if (!s?.match) break;

    const gap = s.isLive ? LIVE_GAP_MS : IDLE_GAP_MS;
    const t0 = Date.now();

    try {
      const full = await fetchDetail(s.match, false);
      if (full) emit(key, mergeDetails(pollers.get(key)?.detail, full, { isFull: true, match: s.match }));
    } catch (err) {
      console.warn('Match detail poll failed:', err);
    }

    const elapsed = Date.now() - t0;
    await sleep(Math.max(0, gap - elapsed));
  }

  const end = pollers.get(key);
  if (end) end.running = false;
}

function ensurePoller(match, { priority = false } = {}) {
  const key = getPollerKey(match);
  if (!key || !canPoll(match)) return;

  const isLive = match.matchState === 'in' || match.isLive;

  if (!pollers.has(key)) {
    if (!priority && pollers.size >= MAX_POLLERS) return;

    pollers.set(key, {
      match,
      detail: null,
      version: 0,
      listeners: new Set(),
      running: false,
      isLive,
      priority,
    });
    pollLoop(key);
  } else {
    const s = pollers.get(key);
    s.match = match;
    s.isLive = isLive;
    if (priority) s.priority = true;
  }
}

export function prefetchMatchDetail(match, { priority = false } = {}) {
  if (!match) return;
  ensurePoller(match, { priority });
}

function removeListener(key, listener) {
  const state = pollers.get(key);
  if (!state) return;
  state.listeners.delete(listener);
  if (state.listeners.size === 0) {
    pollers.delete(key);
  }
}

export function subscribeMatchDetailStore(matchId, listener, match) {
  if (!matchId) return () => {};
  if (match && canPoll(match)) {
    ensurePoller(match, { priority: true });
  }
  const state = pollers.get(matchId);
  if (!state) return () => {};
  state.listeners.add(listener);
  return () => removeListener(matchId, listener);
}

export function getMatchDetailSnapshot(matchId) {
  return pollers.get(matchId)?.detail ?? null;
}

export function getMatchDetailVersion(matchId) {
  return pollers.get(matchId)?.version ?? 0;
}

export function subscribeMatchDetail(match, listener) {
  const key = getPollerKey(match);
  if (!key || !canPoll(match)) return () => {};

  ensurePoller(match, { priority: true });

  const state = pollers.get(key);
  const wrapped = () => {
    if (state.detail) listener(state.detail);
  };
  state.listeners.add(wrapped);
  if (state.detail) listener(state.detail);

  return () => removeListener(key, wrapped);
}

export function enrichFromPoller(match) {
  const key = getPollerKey(match);
  if (!key) return match;
  const detail = pollers.get(key)?.detail;
  if (!detail) return match;
  return enrichMatchWithDetail(match, detail);
}

export { canPoll };
