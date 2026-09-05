/**
 * CREX cricket scores from the public live-score HTML (Angular SSR + JSON-LD).
 * https://crex.com/cricket-live-score
 */

import { formatTeamShortName } from '../src/utils/teamShortName.js';
import { recordFeedHydrationSuccess, recordFeedHydrationFailure } from './feedHealthEngine.mjs';
import {
  cricketStatusFromText,
  parseCricketScoreText,
  parseOversText,
  stripTags,
  teamBlock,
  winnerSideFromComment,
} from './providers/htmlCricketScore.mjs';

const CREX_ORIGIN = 'https://crex.com';
const CREX_LIVE_URLS = [
  `${CREX_ORIGIN}/cricket-live-score/`,
  `${CREX_ORIGIN}/cricket-live-score`,
  `${CREX_ORIGIN}/live-cricket-scores`,
];

const CREX_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
  Referer: `${CREX_ORIGIN}/`,
};

const CACHE_MS = Number(process.env.CREX_CACHE_MS) || 10_000;
let cached = { at: 0, matches: [], byId: new Map() };

function extractCrexId(href = '') {
  const raw = String(href);
  const tail = raw.match(/match-updates-([A-Za-z0-9]+)/i);
  if (tail) return tail[1];
  const slug = raw.match(/\/cricket-live-score\/([^/?#]+)/i);
  return slug ? slug[1] : '';
}

function innerAttr(block, cls) {
  const re = new RegExp(`class="[^"]*${cls}[^"]*"[^>]*>([\\s\\S]*?)</`, 'i');
  const hit = block.match(re);
  return hit ? stripTags(hit[1]) : '';
}

export function parseCrexJsonLdEvents(html = '') {
  const matches = [];
  const scripts = String(html).matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
  for (const script of scripts) {
    try {
      const data = JSON.parse(script[1]);
      const items = data?.mainEntity?.itemListElement || data?.itemListElement || [];
      for (const row of items) {
        const item = row?.item || row;
        if (item?.['@type'] !== 'SportsEvent') continue;
        const href = item.url || '';
        const id = extractCrexId(href);
        const competitors = item.competitor || [];
        const t1 = competitors[0]?.name;
        const t2 = competitors[1]?.name;
        if (!id || !t1 || !t2) continue;
        matches.push({
          id: `crex_${id}`,
          crexEventId: id,
          source: 'crex',
          provider: 'crex',
          sport: 'cricket',
          league: 'CREX',
          team1: teamBlock(t1, formatTeamShortName(t1)),
          team2: teamBlock(t2, formatTeamShortName(t2), '#e5e7eb'),
          startTime: item.startDate || null,
          crexUrl: href.startsWith('http') ? href : `${CREX_ORIGIN}${href}`,
          isLive: false,
          isCompleted: false,
          matchState: 'pre',
          status: 'SCHEDULED',
          time: 'Scheduled',
          score1: 0,
          score2: 0,
          liveDetails: { runs: 0, wickets: 0, score2: 0, wickets2: 0, commentary: '' },
        });
      }
    } catch {
      // ignore broken ld+json
    }
  }
  return matches;
}

export function parseCrexLiveCards(html = '') {
  const matches = [];
  const re = /<a[^>]+href="([^"]*cricket-live-score\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const part of String(html).matchAll(re)) {
    const href = part[1];
    const block = part[2];
    if (!/team-name|team-score|inning-active/.test(block)) continue;
    const id = extractCrexId(href);
    const names = [...block.matchAll(/class="[^"]*team-name[^"]*"[^>]*>([\s\S]*?)<\//gi)]
      .map((m) => stripTags(m[1]))
      .filter(Boolean);
    if (!id || names.length < 2) continue;

    const scoreBits = [...block.matchAll(/<(?:span|div)[^>]*class="[^"]*(?:inning-active|team-score)[^"]*"[^>]*>([\s\S]*?)<\//gi)]
      .map((m) => stripTags(m[1]))
      .filter((t) => /\d/.test(t));
    const oversBits = [...block.matchAll(/class="[^"]*match-over[^"]*"[^>]*>([\s\S]*?)<\//gi)]
      .map((m) => stripTags(m[1]));
    const s1 = parseCricketScoreText(scoreBits[0] || '');
    const s2 = parseCricketScoreText(scoreBits[1] || '');
    const o1 = parseOversText(oversBits[0] || '');
    const o2 = parseOversText(oversBits[1] || '');
    const comment = innerAttr(block, 'comment') || stripTags((block.match(/class="comment"[^>]*>([\s\S]*?)</i) || [])[1] || '');
    const live = /liveTag|>\s*Live\s*</i.test(block) || /innings break|need |required /i.test(comment);
    const flags = cricketStatusFromText({ live, comment });
    const venue = stripTags((block.match(/class="match-number"[^>]*>([\s\S]*?)<\/div>/i) || [])[1] || '');

    matches.push({
      id: `crex_${id}`,
      crexEventId: id,
      source: 'crex',
      provider: 'crex',
      sport: 'cricket',
      league: venue.split(',')[0] || 'CREX',
      venue: { name: venue || 'Stadium', city: '' },
      team1: teamBlock(names[0], names[0]),
      team2: teamBlock(names[1], names[1], '#e5e7eb'),
      ...flags,
      winnerSide: winnerSideFromComment(comment, names[0], names[1]),
      score1: s1.runs,
      score2: s2.runs,
      liveDetails: {
        runs: s1.runs,
        wickets: s1.wickets,
        overs: o1 || '0.0',
        score2: s2.runs,
        wickets2: s2.wickets,
        overs2: o2 || '0.0',
        commentary: comment || flags.time,
      },
      crexUrl: href.startsWith('http') ? href : `${CREX_ORIGIN}${href}`,
    });
  }
  return matches;
}

export function parseCrexHtml(html = '') {
  const byId = new Map();
  for (const match of [...parseCrexJsonLdEvents(html), ...parseCrexLiveCards(html)]) {
    const prev = byId.get(match.id);
    if (!prev) {
      byId.set(match.id, match);
      continue;
    }
    const scored = (match.liveDetails?.runs || 0) + (match.liveDetails?.score2 || 0);
    const prevScored = (prev.liveDetails?.runs || 0) + (prev.liveDetails?.score2 || 0);
    const prefer = match.isLive || match.isCompleted || scored > prevScored
      || (match.team1?.name?.length > 3 && prev.team1?.name?.length <= 3);
    byId.set(match.id, prefer ? {
      ...prev,
      ...match,
      team1: match.team1?.name?.length >= prev.team1?.name?.length ? match.team1 : prev.team1,
      team2: match.team2?.name?.length >= prev.team2?.name?.length ? match.team2 : prev.team2,
      liveDetails: { ...prev.liveDetails, ...match.liveDetails },
    } : {
      ...match,
      ...prev,
      liveDetails: { ...match.liveDetails, ...prev.liveDetails },
    });
  }
  return [...byId.values()];
}

function indexMatches(matches) {
  const byId = new Map();
  for (const match of matches) {
    byId.set(match.id, match);
    if (match.crexEventId) byId.set(match.crexEventId, match);
  }
  return byId;
}

export async function fetchCrexCricketMatches(type = 'live') {
  if (cached.matches.length && Date.now() - cached.at < CACHE_MS) {
    return filterCrexType(cached.matches, type);
  }

  let lastError = null;
  for (const url of CREX_LIVE_URLS) {
    try {
      const res = await fetch(url, { headers: CREX_HEADERS, cache: 'no-store', signal: AbortSignal.timeout(12_000) });
      if (!res.ok) throw new Error(`CREX ${res.status}`);
      const html = await res.text();
      const matches = parseCrexHtml(html);
      if (matches.length === 0) continue;
      cached = { at: Date.now(), matches, byId: indexMatches(matches) };
      recordFeedHydrationSuccess('crex', { matchCount: matches.length });
      return filterCrexType(matches, type);
    } catch (err) {
      lastError = err;
    }
  }

  if (lastError) {
    recordFeedHydrationFailure('crex', lastError, { stage: 'fetch' });
    console.warn('[CREX Provider] Live fetch error:', lastError.message);
  }
  return {
    provider: 'crex',
    source: 'crex',
    sourceType: 'live_scores',
    matches: [],
    counts: { total: 0 },
  };
}

function filterCrexType(matches, type) {
  let list = matches;
  if (type === 'live') list = matches.filter((m) => m.isLive);
  else if (type === 'completed') list = matches.filter((m) => m.isCompleted);
  return {
    provider: 'crex',
    source: 'crex',
    sourceType: 'live_scores',
    matches: list,
    counts: { total: list.length },
  };
}

export async function fetchCrexMatchById(matchId) {
  const id = String(matchId || '').replace(/^crex_/i, '').trim();
  if (!id) return null;
  if (cached.byId.has(id) || cached.byId.has(`crex_${id}`)) {
    return cached.byId.get(`crex_${id}`) || cached.byId.get(id);
  }
  const snap = await fetchCrexCricketMatches('all');
  return snap.matches.find((m) => m.crexEventId === id || m.id === `crex_${id}`) || null;
}
