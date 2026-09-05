/**
 * Cricket Liveline / CRIX — https://cricketliveline.app and https://crix.live
 */

import { recordFeedHydrationSuccess, recordFeedHydrationFailure } from '../feedHealthEngine.mjs';
import {
  cricketStatusFromText,
  parseCricketScoreText,
  parseOversText,
  stripTags,
  teamBlock,
  winnerSideFromComment,
} from './htmlCricketScore.mjs';

const CRIX_ORIGIN = process.env.CRICKETLIVELINE_ORIGIN || 'https://cricketliveline.app';
const CRIX_URLS = [
  `${CRIX_ORIGIN}/matches?filter=live`,
  `${CRIX_ORIGIN}/`,
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
  Referer: `${CRIX_ORIGIN}/`,
};

const CACHE_MS = Number(process.env.CRICKETLIVELINE_CACHE_MS) || 10_000;
let cached = { at: 0, matches: [], byId: new Map() };

function dashScore(text) {
  const raw = stripTags(text);
  if (!raw || raw === '—' || raw === '–') return { runs: 0, wickets: 0, raw };
  return parseCricketScoreText(raw);
}

export function parseCrixHeroCards(html = '') {
  const matches = [];
  const re = /<a href="\/match\/(\d+)" class="hero-card">([\s\S]*?)<\/a>/gi;
  for (const part of String(html).matchAll(re)) {
    const id = part[1];
    const block = part[2];
    const series = stripTags((block.match(/class="hero-card-series"[^>]*>([\s\S]*?)</i) || [])[1] || '');
    const names = [...block.matchAll(/class="hero-team-name"[^>]*>([\s\S]*?)</gi)].map((m) => stripTags(m[1]));
    const scores = [...block.matchAll(/class="hero-score"[^>]*>([\s\S]*?)</gi)].map((m) => m[1]);
    const overs = [...block.matchAll(/class="hero-overs"[^>]*>([\s\S]*?)</gi)].map((m) => stripTags(m[1]));
    const status = stripTags((block.match(/class="hero-status"[^>]*>([\s\S]*?)</i) || [])[1] || '');
    if (names.length < 2) continue;
    const s1 = dashScore(scores[0] || '');
    const s2 = dashScore(scores[1] || '');
    const flags = cricketStatusFromText({
      live: true,
      comment: status,
      completedHint: /won by|match drawn/i.test(status),
    });
    matches.push({
      id: `crix_${id}`,
      crixMatchId: id,
      source: 'cricketliveline',
      provider: 'cricketliveline',
      sport: 'cricket',
      league: series.replace(/\s*·\s*/, ' · ') || 'CRIX',
      team1: teamBlock(names[0]),
      team2: teamBlock(names[1], null, '#e5e7eb'),
      ...flags,
      winnerSide: winnerSideFromComment(status, names[0], names[1]),
      score1: s1.runs,
      score2: s2.runs,
      liveDetails: {
        runs: s1.runs,
        wickets: s1.wickets,
        overs: parseOversText(overs[0] || '') || '0.0',
        score2: s2.runs,
        wickets2: s2.wickets,
        overs2: parseOversText(overs[1] || '') || '0.0',
        commentary: status || flags.time,
      },
      crixUrl: `${CRIX_ORIGIN}/match/${id}`,
    });
  }
  return matches;
}

export function parseCrixLiveMatchCards(html = '') {
  const matches = [];
  const re = /<a href="\/match\/(\d+)" class="live-match-card">([\s\S]*?)<\/a>/gi;
  for (const part of String(html).matchAll(re)) {
    const id = part[1];
    const block = part[2];
    const series = stripTags((block.match(/class="lmc-series"[^>]*>([\s\S]*?)</i) || [])[1] || '');
    const names = [...block.matchAll(/class="lmc-name"[^>]*>([\s\S]*?)</gi)].map((m) => stripTags(m[1]));
    const scores = [...block.matchAll(/class="lmc-score"[^>]*>([\s\S]*?)</gi)].map((m) => m[1]);
    const overs = [...block.matchAll(/class="lmc-overs"[^>]*>([\s\S]*?)</gi)].map((m) => stripTags(m[1]));
    const status = stripTags((block.match(/class="lmc-status"[^>]*>([\s\S]*?)</i) || [])[1] || '');
    if (names.length < 2) continue;
    const s1 = dashScore(scores[0] || '');
    const s2 = dashScore(scores[1] || '');
    const flags = cricketStatusFromText({ live: true, comment: status });
    matches.push({
      id: `crix_${id}`,
      crixMatchId: id,
      source: 'cricketliveline',
      provider: 'cricketliveline',
      sport: 'cricket',
      league: series || 'CRIX',
      team1: teamBlock(names[0]),
      team2: teamBlock(names[1], null, '#e5e7eb'),
      ...flags,
      winnerSide: winnerSideFromComment(status, names[0], names[1]),
      score1: s1.runs,
      score2: s2.runs,
      liveDetails: {
        runs: s1.runs,
        wickets: s1.wickets,
        overs: parseOversText(overs[0] || '') || '0.0',
        score2: s2.runs,
        wickets2: s2.wickets,
        overs2: parseOversText(overs[1] || '') || '0.0',
        commentary: status || flags.time,
      },
      crixUrl: `${CRIX_ORIGIN}/match/${id}`,
    });
  }
  return matches;
}

export function parseCrixUpcomingRows(html = '') {
  const matches = [];
  const re = /<a href="\/match\/(\d+)" class="home-match-row[^"]*">([\s\S]*?)<\/a>/gi;
  for (const part of String(html).matchAll(re)) {
    const id = part[1];
    const block = part[2];
    const names = [...block.matchAll(/class="hmr-name"[^>]*>([\s\S]*?)</gi)].map((m) => stripTags(m[1]));
    if (names.length < 2) continue;
    const series = stripTags((block.match(/class="hmr-series"[^>]*>([\s\S]*?)</i) || [])[1] || '');
    const time = stripTags((block.match(/class="hmr-time"[^>]*>([\s\S]*?)</i) || [])[1] || '');
    matches.push({
      id: `crix_${id}`,
      crixMatchId: id,
      source: 'cricketliveline',
      provider: 'cricketliveline',
      sport: 'cricket',
      league: series || 'CRIX',
      team1: teamBlock(names[0]),
      team2: teamBlock(names[1], null, '#e5e7eb'),
      isLive: false,
      isCompleted: false,
      matchState: 'pre',
      status: 'SCHEDULED',
      time: time || 'Scheduled',
      score1: 0,
      score2: 0,
      liveDetails: {
        runs: 0, wickets: 0, overs: '0.0', score2: 0, wickets2: 0, overs2: '0.0', commentary: time,
      },
      crixUrl: `${CRIX_ORIGIN}/match/${id}`,
    });
  }
  return matches;
}

export function parseCricketLivelineHtml(html = '') {
  const byId = new Map();
  for (const match of [
    ...parseCrixUpcomingRows(html),
    ...parseCrixHeroCards(html),
    ...parseCrixLiveMatchCards(html),
  ]) {
    const prev = byId.get(match.id);
    if (!prev || match.isLive || match.isCompleted) byId.set(match.id, match);
  }
  return [...byId.values()];
}

function indexMatches(matches) {
  const byId = new Map();
  for (const match of matches) {
    byId.set(match.id, match);
    if (match.crixMatchId) byId.set(match.crixMatchId, match);
  }
  return byId;
}

export async function fetchCricketLivelineScores({ force = false } = {}) {
  if (!force && cached.matches.length && Date.now() - cached.at < CACHE_MS) {
    return { source: 'cricketliveline', matches: cached.matches, counts: { total: cached.matches.length } };
  }

  let lastError = null;
  const collected = new Map();
  for (const url of CRIX_URLS) {
    try {
      const res = await fetch(url, { headers: HEADERS, cache: 'no-store', signal: AbortSignal.timeout(12_000) });
      if (!res.ok) throw new Error(`Cricket Liveline ${res.status}`);
      for (const match of parseCricketLivelineHtml(await res.text())) {
        const prev = collected.get(match.id);
        if (!prev || match.isLive || (match.liveDetails?.runs || 0) > (prev.liveDetails?.runs || 0)) {
          collected.set(match.id, match);
        }
      }
    } catch (err) {
      lastError = err;
    }
  }

  const matches = [...collected.values()];
  if (matches.length === 0 && lastError) {
    recordFeedHydrationFailure('cricketliveline', lastError, { stage: 'fetch' });
    throw lastError;
  }
  cached = { at: Date.now(), matches, byId: indexMatches(matches) };
  recordFeedHydrationSuccess('cricketliveline', { matchCount: matches.length });
  return { source: 'cricketliveline', matches, counts: { total: matches.length } };
}

export async function fetchCricketLivelineMatchById(matchId) {
  const id = String(matchId || '').replace(/^crix_/i, '').trim();
  if (!id) return null;
  if (cached.byId.has(id) || cached.byId.has(`crix_${id}`)) {
    return cached.byId.get(`crix_${id}`) || cached.byId.get(id);
  }
  const snap = await fetchCricketLivelineScores({ force: cached.matches.length === 0 });
  return snap.matches.find((m) => m.crixMatchId === id || m.id === `crix_${id}`) || null;
}
