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

function parseCrexTeamScoreBlocks(block = '') {
  const teams = [];
  const re = /<div[^>]*class="[^"]*team-score[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
  for (const part of String(block).matchAll(re)) {
    const inner = part[1];
    const name = stripTags((inner.match(/class="[^"]*team-name[^"]*"[^>]*>([\s\S]*?)<\//i) || [])[1] || '');
    if (!name) continue;
    const batting = /inning-active/i.test(inner);
    let scoreText = stripTags((inner.match(/class="[^"]*inning-active[^"]*"[^>]*>([\s\S]*?)<\//i) || [])[1] || '');
    if (!scoreText) {
      const bits = [...inner.matchAll(/<(?:span|div)[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\//gi)]
        .filter((row) => !/team-name|match-over/i.test(row[1] || ''))
        .map((row) => stripTags(row[2]))
        .filter((text) => /\d/.test(text));
      scoreText = bits[0] || '';
    }
    const overs = parseOversText(
      stripTags((inner.match(/class="[^"]*match-over[^"]*"[^>]*>([\s\S]*?)<\//i) || [])[1] || ''),
    ) || '0.0';
    const score = parseCricketScoreText(scoreText);
    teams.push({
      name,
      runs: score.runs,
      wickets: score.wickets,
      overs,
      batting,
    });
  }
  return teams;
}

function buildCrexLiveDetails(teams, comment = '') {
  const t1 = teams[0] || { name: '', runs: 0, wickets: 0, overs: '0.0', batting: false };
  const t2 = teams[1] || { name: '', runs: 0, wickets: 0, overs: '0.0', batting: false };
  const chasing = /runs needed|need \d+\s*runs|required\s+rate|to win/i.test(comment);
  const secondInnings = chasing
    || t1.batting
    || t2.batting
    || (Number(t1.wickets) >= 10 && Number(t2.runs) > 0)
    || (Number(t2.wickets) >= 10 && Number(t1.runs) > 0);

  let first = t1;
  let chase = t2;
  if (secondInnings) {
    if (t1.batting && !t2.batting) {
      first = t2;
      chase = t1;
    } else if (t2.batting || chasing) {
      first = t1;
      chase = t2;
    }
  }

  // CREX often prints completed totals as runs-only (no wickets) once the chase starts.
  if (secondInnings && Number(first.runs) > 0 && Number(first.wickets) === 0 && !first.batting) {
    first = { ...first, wickets: 10 };
  }

  const liveDetails = {
    runs: t1.runs,
    wickets: t1.wickets,
    overs: t1.overs || '0.0',
    score2: t2.runs,
    wickets2: t2.wickets,
    overs2: t2.overs || '0.0',
    commentary: comment,
  };

  if (secondInnings) {
    liveDetails.firstRuns = first.runs;
    liveDetails.firstWickets = first.wickets;
    liveDetails.firstOvers = first.overs || '0.0';
    liveDetails.firstTeamName = first.name;
    liveDetails.chaseRuns = chase.runs;
    liveDetails.chaseWickets = chase.wickets;
    liveDetails.chaseOvers = chase.overs || '0.0';
    liveDetails.chaseTeamName = chase.name;
    liveDetails.inningsId = 2;
    // Keep score1/score2 team-aligned with listing order, but expose chase on batting side.
    liveDetails.runs = chase.runs;
    liveDetails.wickets = chase.wickets;
    liveDetails.overs = chase.overs || '0.0';
  } else {
    liveDetails.inningsId = 1;
    liveDetails.firstRuns = t1.runs;
    liveDetails.firstWickets = t1.wickets;
    liveDetails.firstOvers = t1.overs || '0.0';
    liveDetails.firstTeamName = t1.name;
  }

  return liveDetails;
}

export function parseCrexLiveCards(html = '') {
  const matches = [];
  const re = /<a[^>]+href="([^"]*cricket-live-score\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const part of String(html).matchAll(re)) {
    const href = part[1];
    const block = part[2];
    if (!/team-name|team-score|inning-active/.test(block)) continue;
    const id = extractCrexId(href);
    const teams = parseCrexTeamScoreBlocks(block);
    const names = teams.map((t) => t.name).filter(Boolean);
    if (!id || names.length < 2) continue;

    const comment = innerAttr(block, 'comment') || stripTags((block.match(/class="comment"[^>]*>([\s\S]*?)</i) || [])[1] || '');
    const live = /liveTag|>\s*Live\s*</i.test(block) || /innings break|need |required |runs needed/i.test(comment);
    const flags = cricketStatusFromText({ live, comment });
    const venue = stripTags((block.match(/class="match-number"[^>]*>([\s\S]*?)<\/div>/i) || [])[1] || '');
    const liveDetails = buildCrexLiveDetails(teams, comment || flags.time);

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
      score1: teams[0].runs,
      score2: teams[1].runs,
      liveDetails,
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
