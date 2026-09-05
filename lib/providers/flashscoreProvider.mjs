/**
 * Flashscore live / results feed — https://www.flashscore.com
 * Uses the same x/feed protocol the site loads (x-fsign from their JS).
 */

import { formatTeamShortName } from '../../src/utils/teamShortName.js';
import { recordFeedHydrationSuccess, recordFeedHydrationFailure } from '../feedHealthEngine.mjs';

const FLASHSCORE_ORIGIN = 'https://www.flashscore.com';
const FEED_BASE = `${FLASHSCORE_ORIGIN}/x/feed`;
const DEFAULT_FSIGN = process.env.FLASHSCORE_FSIGN || 'SW9D1eZo';

const SPORT_FEEDS = [
  { id: 1, sport: 'soccer' },
  { id: 2, sport: 'tennis' },
  { id: 3, sport: 'basketball' },
  { id: 4, sport: 'hockey' },
  { id: 13, sport: 'cricket' },
  { id: 15, sport: 'snooker' },
  { id: 25, sport: 'table-tennis' },
];

const SPORT_COLORS = {
  soccer: '#22c55e',
  tennis: '#14b8a6',
  basketball: '#f59e0b',
  hockey: '#64748b',
  cricket: '#f97316',
  snooker: '#15803d',
  'table-tennis': '#06b6d4',
};

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: '*/*',
  Referer: `${FLASHSCORE_ORIGIN}/`,
};

const CACHE_MS = Number(process.env.FLASHSCORE_CACHE_MS) || 12_000;
let cached = { at: 0, matches: [], byId: new Map() };

export function parseFlashscoreRecord(chunk = '') {
  const rec = {};
  for (const part of String(chunk).split('¬')) {
    if (!part.includes('÷')) continue;
    const [key, ...rest] = part.split('÷');
    if (key) rec[key] = rest.join('÷');
  }
  return rec;
}

export function parseFlashscoreFeed(raw = '', { sport = 'soccer' } = {}) {
  const matches = [];
  let league = '';
  let leaguePath = '';

  for (const chunk of String(raw).split('~')) {
    if (!chunk) continue;
    if (chunk.startsWith('ZA÷') || chunk.includes('¬ZA÷')) {
      const rec = parseFlashscoreRecord(chunk.startsWith('ZA÷') ? chunk : `ZA÷${chunk.split('ZA÷')[1]}`);
      league = rec.ZA || rec.ZAF || league;
      leaguePath = rec.ZL || leaguePath;
      continue;
    }
    if (!chunk.startsWith('AA÷')) continue;
    const rec = parseFlashscoreRecord(chunk);
    const mapped = mapFlashscoreEvent(rec, { sport, league, leaguePath });
    if (mapped) matches.push(mapped);
  }
  return matches;
}

function num(value) {
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function statusFromCodes(ab) {
  const code = String(ab || '');
  if (code === '2') return { isLive: true, isCompleted: false, matchState: 'in', status: 'LIVE', time: 'Live' };
  if (code === '3') return { isLive: false, isCompleted: true, matchState: 'post', status: 'COMPLETED', time: 'Completed' };
  if (code === '4' || code === '5') {
    return { isLive: false, isCompleted: true, matchState: 'post', status: 'ABANDONED', time: 'Abandoned' };
  }
  return { isLive: false, isCompleted: false, matchState: 'pre', status: 'SCHEDULED', time: 'Scheduled' };
}

function winnerFromRecord(rec, homeScore, awayScore, completed) {
  const as = String(rec.AS ?? rec.AZ ?? '');
  if (as === '1') return '1';
  if (as === '2') return '2';
  if (as === '0' || as === 'X') return 'X';
  if (!completed) return null;
  if (homeScore == null || awayScore == null) return null;
  if (homeScore > awayScore) return '1';
  if (awayScore > homeScore) return '2';
  return null;
}

export function mapFlashscoreEvent(rec, { sport, league, leaguePath } = {}) {
  const eventId = rec.AA;
  const homeName = rec.AE || rec.FH || rec.CX;
  const awayName = rec.AF || rec.FK;
  if (!eventId || !homeName || !awayName) return null;

  const homeScore = num(rec.AG);
  const awayScore = num(rec.AH);
  const flags = statusFromCodes(rec.AB);
  const winnerSide = winnerFromRecord(rec, homeScore, awayScore, flags.isCompleted);
  const startUnix = num(rec.AD) || num(rec.ADE);
  const commentary = flags.isLive && num(rec.AC) > 0 ? `${num(rec.AC)}'` : (rec.CX || '');

  return {
    id: `fs_${eventId}`,
    flashscoreEventId: eventId,
    source: 'flashscore',
    provider: 'flashscore',
    league: league || rec.ZAF || sport || 'Flashscore',
    sport,
    sportColor: SPORT_COLORS[sport] || '#64748b',
    time: flags.time,
    isLive: flags.isLive,
    isCompleted: flags.isCompleted,
    matchState: flags.matchState,
    status: flags.status,
    winnerSide,
    team1: {
      name: homeName,
      shortName: rec.WM || formatTeamShortName(homeName),
      color: '#22c55e',
    },
    team2: {
      name: awayName,
      shortName: rec.WN || formatTeamShortName(awayName),
      color: '#e5e7eb',
    },
    score1: homeScore ?? 0,
    score2: awayScore ?? 0,
    liveDetails: {
      score1: homeScore ?? 0,
      score2: awayScore ?? 0,
      minute: flags.isLive ? commentary : undefined,
      commentary: commentary || flags.time,
    },
    startTime: startUnix ? new Date(startUnix * 1000).toISOString() : null,
    flashscorePath: leaguePath || null,
    flashscoreUrl: `${FLASHSCORE_ORIGIN}/match/${eventId}/`,
  };
}

async function fetchFeed(sportId, tab, fsign) {
  const url = `${FEED_BASE}/f_${sportId}_${tab}_1_en_1`;
  const res = await fetch(url, {
    headers: { ...HEADERS, 'x-fsign': fsign },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`Flashscore feed ${sportId}/${tab} ${res.status}`);
  return res.text();
}

async function resolveFsign() {
  if (DEFAULT_FSIGN) return DEFAULT_FSIGN;
  try {
    const res = await fetch(FLASHSCORE_ORIGIN, {
      headers: HEADERS,
      signal: AbortSignal.timeout(8000),
    });
    const html = await res.text();
    const hit = html.match(/SW9D1eZo|feed_sign["']?\s*[:=]\s*["']([^"']+)/i);
    return hit?.[1] || hit?.[0] || DEFAULT_FSIGN;
  } catch {
    return DEFAULT_FSIGN;
  }
}

function indexMatches(matches) {
  const byId = new Map();
  for (const match of matches) {
    byId.set(match.id, match);
    byId.set(match.flashscoreEventId, match);
    byId.set(`fs_${match.flashscoreEventId}`, match);
  }
  return byId;
}

export async function fetchFlashscoreLiveScores({ force = false } = {}) {
  if (!force && cached.matches.length && Date.now() - cached.at < CACHE_MS) {
    return { source: 'flashscore', matches: cached.matches, counts: { total: cached.matches.length } };
  }

  const fsign = await resolveFsign();
  const jobs = [];
  for (const sport of SPORT_FEEDS) {
    for (const tab of [0, 1]) {
      jobs.push(
        fetchFeed(sport.id, tab, fsign)
          .then((raw) => parseFlashscoreFeed(raw, { sport: sport.sport }))
          .catch((err) => {
            console.warn('[flashscore]', sport.sport, tab, err.message);
            return [];
          }),
      );
    }
  }

  const chunks = await Promise.all(jobs);
  const byId = new Map();
  for (const list of chunks) {
    for (const match of list) {
      const prev = byId.get(match.id);
      if (!prev || (match.isLive && !prev.isLive) || (match.isCompleted && !prev.isCompleted)) {
        byId.set(match.id, match);
      } else if (prev && (match.score1 || match.score2) && !(prev.score1 || prev.score2)) {
        byId.set(match.id, { ...prev, ...match });
      }
    }
  }

  const matches = [...byId.values()];
  cached = { at: Date.now(), matches, byId: indexMatches(matches) };
  recordFeedHydrationSuccess('flashscore', { matchCount: matches.length });
  return { source: 'flashscore', matches, counts: { total: matches.length } };
}

export async function fetchFlashscoreMatchById(matchId) {
  const id = String(matchId || '').replace(/^fs_/i, '').trim();
  if (!id) return null;
  if (cached.byId.has(id) || cached.byId.has(`fs_${id}`)) {
    return cached.byId.get(`fs_${id}`) || cached.byId.get(id);
  }
  try {
    const snap = await fetchFlashscoreLiveScores({ force: cached.matches.length === 0 });
    return snap.matches.find((m) => m.flashscoreEventId === id || m.id === `fs_${id}`) || null;
  } catch (err) {
    recordFeedHydrationFailure('flashscore', err, { stage: 'match-by-id' });
    return null;
  }
}

export function lookupFlashscoreMatch(match) {
  const direct = fetchFlashscoreMatchById(match?.flashscoreEventId || match?.id);
  return direct.then((hit) => {
    if (hit) return hit;
    const t1 = String(match?.team1?.name || '').toLowerCase();
    const t2 = String(match?.team2?.name || '').toLowerCase();
    if (!t1 || !t2) return null;
    const tokens = (name) => String(name).toLowerCase().replace(/[.,]/g, ' ').split(/\s+/).filter((w) => w.length > 2);
    const a = tokens(t1);
    const b = tokens(t2);
    return cached.matches.find((row) => {
      const n1 = String(row.team1?.name || '').toLowerCase();
      const n2 = String(row.team2?.name || '').toLowerCase();
      const hitDirect = a.every((w) => n1.includes(w)) && b.every((w) => n2.includes(w));
      const hitSwap = a.every((w) => n2.includes(w)) && b.every((w) => n1.includes(w));
      return hitDirect || hitSwap;
    }) || null;
  });
}
