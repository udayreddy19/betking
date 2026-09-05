/**
 * Cricket Guru live scores — https://www.cricketguru.com/live-scores
 * Parses SSR HTML cards and TransferState (clg-state) JSON.
 */

import { recordFeedHydrationSuccess, recordFeedHydrationFailure } from '../feedHealthEngine.mjs';
import {
  cricketStatusFromText,
  decodeHtmlEntities,
  parseCricketScoreText,
  parseOversText,
  stripTags,
  teamBlock,
  winnerSideFromComment,
} from './htmlCricketScore.mjs';

const GURU_ORIGIN = 'https://www.cricketguru.com';
const GURU_LIVE_URL = `${GURU_ORIGIN}/live-scores`;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
  Referer: `${GURU_ORIGIN}/`,
};

const CACHE_MS = Number(process.env.CRICKETGURU_CACHE_MS) || 10_000;
let cached = { at: 0, matches: [], byId: new Map() };

function teamName(value) {
  if (!value) return '';
  if (typeof value === 'string') return decodeHtmlEntities(value).trim();
  return decodeHtmlEntities(value.n || value.name || value.nm || value.tn || '').trim();
}

export function mapGuruMatch(raw = {}, index = 0) {
  const t1 = teamName(raw.t1n || raw.t1 || raw.team1 || raw.home || raw.teamA);
  const t2 = teamName(raw.t2n || raw.t2 || raw.team2 || raw.away || raw.teamB);
  if (!t1 || !t2) return null;
  const id = String(raw.id || raw.mid || raw.k || raw.matchId || raw.key || `g${index}`);
  const s1 = parseCricketScoreText(raw.s1 || raw.sc1 || raw.score1 || raw.t1s || '');
  const s2 = parseCricketScoreText(raw.s2 || raw.sc2 || raw.score2 || raw.t2s || '');
  const comment = String(raw.stt || raw.statusText || raw.comment || raw.n || raw.status || '');
  const live = raw.live === true || /live|in progress|innings/i.test(String(raw.st || raw.status || comment));
  const flags = cricketStatusFromText({ live, comment, completedHint: /complete|result/i.test(String(raw.st || '')) });
  return {
    id: `guru_${id}`,
    guruMatchId: id,
    source: 'cricketguru',
    provider: 'cricketguru',
    sport: 'cricket',
    league: raw.sn || raw.series || raw.competition || 'Cricket Guru',
    team1: teamBlock(t1, raw.t1sname || raw.t1c),
    team2: teamBlock(t2, raw.t2sname || raw.t2c, '#e5e7eb'),
    ...flags,
    winnerSide: winnerSideFromComment(comment, t1, t2),
    score1: s1.runs,
    score2: s2.runs,
    liveDetails: {
      runs: s1.runs,
      wickets: s1.wickets,
      overs: parseOversText(raw.o1 || raw.overs || '') || '0.0',
      score2: s2.runs,
      wickets2: s2.wickets,
      overs2: parseOversText(raw.o2 || '') || '0.0',
      commentary: comment || flags.time,
    },
    guruUrl: raw.url ? (String(raw.url).startsWith('http') ? raw.url : `${GURU_ORIGIN}${raw.url}`) : GURU_LIVE_URL,
  };
}

function walkGuruRecords(node, out = []) {
  if (!node) return out;
  if (Array.isArray(node)) {
    for (const item of node) walkGuruRecords(item, out);
    return out;
  }
  if (typeof node !== 'object') return out;
  const mapped = mapGuruMatch(node, out.length);
  if (mapped) out.push(mapped);
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') walkGuruRecords(value, out);
  }
  return out;
}

export function parseGuruClgState(html = '') {
  const hit = String(html).match(/<script id="clg-state"[^>]*>([\s\S]*?)<\/script>/i);
  if (!hit) return [];
  try {
    const json = JSON.parse(decodeHtmlEntities(hit[1]));
    return walkGuruRecords(json);
  } catch {
    return [];
  }
}

export function parseGuruHtmlCards(html = '') {
  const matches = [];
  const blocks = String(html).matchAll(/<(?:a|div)[^>]+class="[^"]*(?:match-card|live-card|score-card|clg-match)[^"]*"[\s\S]*?<\/(?:a|div)>/gi);
  let i = 0;
  for (const part of blocks) {
    const block = part[0];
    const names = [...block.matchAll(/class="[^"]*(?:team-name|t-name|teamName)[^"]*"[^>]*>([\s\S]*?)</gi)]
      .map((m) => stripTags(m[1]))
      .filter(Boolean);
    if (names.length < 2) continue;
    const scores = [...block.matchAll(/class="[^"]*(?:score|runs)[^"]*"[^>]*>([\s\S]*?)</gi)].map((m) => stripTags(m[1]));
    const href = (block.match(/href="([^"]+)"/) || [])[1] || '';
    const id = (href.match(/\/(\d+)(?:\/|$)/) || [])[1] || `html${i}`;
    const comment = stripTags((block.match(/class="[^"]*(?:status|comment|result)[^"]*"[^>]*>([\s\S]*?)</i) || [])[1] || '');
    const s1 = parseCricketScoreText(scores[0] || '');
    const s2 = parseCricketScoreText(scores[1] || '');
    const live = /live/i.test(block);
    const flags = cricketStatusFromText({ live, comment });
    matches.push({
      id: `guru_${id}`,
      guruMatchId: id,
      source: 'cricketguru',
      provider: 'cricketguru',
      sport: 'cricket',
      league: 'Cricket Guru',
      team1: teamBlock(names[0]),
      team2: teamBlock(names[1], null, '#e5e7eb'),
      ...flags,
      winnerSide: winnerSideFromComment(comment, names[0], names[1]),
      score1: s1.runs,
      score2: s2.runs,
      liveDetails: {
        runs: s1.runs,
        wickets: s1.wickets,
        overs: '0.0',
        score2: s2.runs,
        wickets2: s2.wickets,
        overs2: '0.0',
        commentary: comment || flags.time,
      },
      guruUrl: href ? `${GURU_ORIGIN}${href}` : GURU_LIVE_URL,
    });
    i += 1;
  }
  return matches;
}

export function parseCricketGuruHtml(html = '') {
  const byId = new Map();
  for (const match of [...parseGuruClgState(html), ...parseGuruHtmlCards(html)]) {
    byId.set(match.id, match);
  }
  return [...byId.values()];
}

function indexMatches(matches) {
  const byId = new Map();
  for (const match of matches) {
    byId.set(match.id, match);
    if (match.guruMatchId) byId.set(match.guruMatchId, match);
  }
  return byId;
}

export async function fetchCricketGuruLiveScores({ force = false } = {}) {
  if (!force && cached.matches.length && Date.now() - cached.at < CACHE_MS) {
    return { source: 'cricketguru', matches: cached.matches, counts: { total: cached.matches.length } };
  }
  try {
    const res = await fetch(GURU_LIVE_URL, { headers: HEADERS, cache: 'no-store', signal: AbortSignal.timeout(12_000) });
    if (!res.ok) throw new Error(`Cricket Guru ${res.status}`);
    const matches = parseCricketGuruHtml(await res.text());
    cached = { at: Date.now(), matches, byId: indexMatches(matches) };
    recordFeedHydrationSuccess('cricketguru', { matchCount: matches.length });
    return { source: 'cricketguru', matches, counts: { total: matches.length } };
  } catch (err) {
    recordFeedHydrationFailure('cricketguru', err, { stage: 'fetch' });
    throw err;
  }
}

export async function fetchCricketGuruMatchById(matchId) {
  const id = String(matchId || '').replace(/^guru_/i, '').trim();
  if (!id) return null;
  if (cached.byId.has(id) || cached.byId.has(`guru_${id}`)) {
    return cached.byId.get(`guru_${id}`) || cached.byId.get(id);
  }
  const snap = await fetchCricketGuruLiveScores({ force: cached.matches.length === 0 });
  return snap.matches.find((m) => m.guruMatchId === id || m.id === `guru_${id}`) || null;
}
