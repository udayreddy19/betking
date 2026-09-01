/**
 * Shared live match detail poller — all sports, continuous fetch, instant React sync.
 */
import { enrichMatchWithDetail } from '../utils/matchDetailEnrich';
import { mergeCricketLiveDetails, mergeCricketPlayersOnly } from '../utils/cricketScoreMerge';
import { MATCH_DETAIL_LIVE_POLL_MS, MATCH_DETAIL_IDLE_POLL_MS } from '../config/livePolling';

const LIVE_GAP_MS = MATCH_DETAIL_LIVE_POLL_MS;
const IDLE_GAP_MS = MATCH_DETAIL_IDLE_POLL_MS;
const MAX_POLLERS = 16;

/** @type {Map<string, { match: object, detail: object|null, version: number, listeners: Set<Function>, running: boolean, isLive: boolean, priority: boolean }>} */
const pollers = new Map();

/** Persist detail across poller eviction so widgets keep scorecard/squads. */
const detailCache = new Map();
const cacheVersions = new Map();

function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

function detailFingerprint(detail) {
  if (!detail) return '';
  const ld = detail.liveDetails || {};
  const b1 = ld.batter1 || {};
  const b2 = ld.batter2 || {};
  const bowl = ld.bowler || {};
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
    ld.requiredRunRate,
    ld.remainingBalls,
    b1.name,
    b1.runs,
    b1.balls,
    b1.fours,
    b1.sixes,
    b2.name,
    b2.runs,
    b2.balls,
    b2.fours,
    b2.sixes,
    bowl.name,
    bowl.wickets,
    bowl.runs,
    bowl.overs,
    ld.commentary,
    (ld.currentOverBalls || []).join(','),
    ld.commentaryFeed?.length ?? 0,
    ld.commentaryFeed?.[0]?.text ?? '',
    ld.commentaryList?.length ?? 0,
    ld.commentaryList?.[0]?.text ?? '',
    detail.squads?.length ?? 0,
    detail.squads?.reduce((n, t) => n + (t.players?.length || 0), 0) ?? 0,
    detail.scorecardInnings?.length ?? 0,
    detail.scorecardInnings?.reduce((n, inn) => n + (inn.batters?.length || 0), 0) ?? 0,
    detail.overHistory?.length ?? 0,
    detail.overHistory?.[detail.overHistory.length - 1]?.overNum ?? '',
  ].join(':');
}

function emit(key, detail) {
  const state = pollers.get(key);
  if (!state) return;
  if (state.detail && detailFingerprint(state.detail) === detailFingerprint(detail)) {
    return;
  }
  detailCache.set(key, detail);
  cacheVersions.set(key, (cacheVersions.get(key) || 0) + 1);
  state.detail = detail;
  state.version += 1;
  state.listeners.forEach((fn) => fn());
  bumpGlobalDetailVersion();
}

let globalDetailVersion = 0;
const globalDetailListeners = new Set();

function bumpGlobalDetailVersion() {
  globalDetailVersion += 1;
  globalDetailListeners.forEach((fn) => fn());
}

export function subscribeGlobalMatchDetails(listener) {
  globalDetailListeners.add(listener);
  return () => globalDetailListeners.delete(listener);
}

export function getGlobalMatchDetailVersion() {
  return globalDetailVersion;
}

async function fetchAndEmit(key) {
  const state = pollers.get(key);
  if (!state?.match) return;
  try {
    const full = await fetchDetail(state.match, false);
    if (full) {
      emit(key, mergeDetails(pollers.get(key)?.detail || detailCache.get(key), full, {
        isFull: true,
        match: state.match,
      }));
    }
  } catch (err) {
    console.warn('Match detail fetch failed:', err);
  }
}

function getPollerKey(match) {
  return match?.id || null;
}

function canPoll(match) {
  if (!match?.id) return false;
  if (match.cricbuzzMatchId || match.id.startsWith('cb_')) return true;
  if (match.source === 'espn' || match.id.startsWith('api_')) return true;
  if (match.espnEventId && match.espnPath) return true;
  if (match.fancodeMatchId || match.source === 'fancode') return true;
  if (match.source === 'srl' || match.id?.startsWith('srl_ipl_')) return true;
  if (
    match.source === '10cric2026' || match.source === '10cric' || match.source === 'live'
    || match.id?.startsWith('10cric_') || match.id?.startsWith('oy_')
    || match.tencricEventId
  ) return true;
  if (match.source === 'crex' || match.id?.startsWith('crex_')) return true;
  return true;
}

function buildDetailUrl(match, fast) {
  const params = new URLSearchParams({
    matchId: match.id,
    sport: match.sport || '',
    source: match.source || '',
    fast: fast ? '1' : '0',
  });

  if (match.league) params.set('league', match.league);
  if (match.team1?.name) params.set('team1', match.team1.name);
  if (match.team2?.name) params.set('team2', match.team2.name);
  if (match.isLive) params.set('isLive', '1');
  if (match.matchState) params.set('matchState', match.matchState);
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
    matchState: next.matchState ?? (next.isLive ? 'in' : undefined) ?? prev.matchState,
    time: next.time ?? prev.time,
    squads: next.squads?.length ? next.squads : prev.squads,
    scorecardInnings: next.scorecardInnings?.length ? next.scorecardInnings : prev.scorecardInnings,
    overHistory: next.overHistory?.length ? next.overHistory : prev.overHistory,
    liveDetails,
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

    if (typeof document !== 'undefined' && document.hidden) {
      await sleep(12_000);
      continue;
    }

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

function canEvict(state, { allowPriority = false } = {}) {
  if (!state || state.listeners.size > 0) return false;
  if (state.priority && !allowPriority) return false;
  return true;
}

/** Free a slot by dropping listener-less prefetch pollers first. */
function evictIdlePoller({ allowPriority = false } = {}) {
  for (const [key, state] of pollers) {
    if (canEvict(state, { allowPriority })) {
      pollers.delete(key);
      return true;
    }
  }
  return false;
}

function ensurePoller(match, { priority = false } = {}) {
  const key = getPollerKey(match);
  if (!key || !canPoll(match)) return;

  const isLive = match.matchState === 'in' || match.isLive;

  if (!pollers.has(key)) {
    if (pollers.size >= MAX_POLLERS) {
      const freed = evictIdlePoller({ allowPriority: false })
        || (priority && evictIdlePoller({ allowPriority: true }));
      if (!freed) return;
    }

    const cached = detailCache.get(key);
    pollers.set(key, {
      match,
      detail: cached || null,
      version: cacheVersions.get(key) || 0,
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
    if (!s.detail && detailCache.has(key)) {
      s.detail = detailCache.get(key);
      s.version = cacheVersions.get(key) || s.version;
    }
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
  if (!state.detail && detailCache.has(matchId)) {
    state.detail = detailCache.get(matchId);
    state.version = cacheVersions.get(matchId) || state.version;
  }
  if (!state.detail) {
    fetchAndEmit(matchId);
  } else {
    queueMicrotask(() => listener());
  }
  return () => removeListener(matchId, listener);
}

export function getMatchDetailSnapshot(matchId) {
  return pollers.get(matchId)?.detail ?? detailCache.get(matchId) ?? null;
}

export function getMatchDetailVersion(matchId) {
  const pollerVersion = pollers.get(matchId)?.version ?? 0;
  const cacheVersion = cacheVersions.get(matchId) ?? 0;
  return Math.max(pollerVersion, cacheVersion);
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
  const detail = pollers.get(key)?.detail ?? detailCache.get(key);
  if (!detail) return match;
  return enrichMatchWithDetail(match, detail);
}

export { canPoll };
