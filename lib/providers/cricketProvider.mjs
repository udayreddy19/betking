/**
 * Cricket Provider Chain
 * Data Sources: CREX (crex.com), Cricbuzz (unofficial), CricAPI (free tier), OpenCricket, Cricsheet
 */

import { fetchCrexCricketMatches } from '../crexCricketProvider.mjs';
import { fetchCricbuzzMatches } from '../cricbuzzLiveScores.mjs';
import { normalizeStandardMatch } from '../normalizers/matchNormalizer.mjs';

function getPairKey(m) {
  const t1 = (m.team1?.name || m.homeTeam?.teamName || m.homeTeam?.name || '').toLowerCase();
  const t2 = (m.team2?.name || m.awayTeam?.teamName || m.awayTeam?.name || '').toLowerCase();
  const blob = `${t1} ${t2} ${m.league || ''} ${m.id || ''}`;
  const gender = /\bwomen\b|\(women\)/.test(blob) ? 'w' : 'm';
  const srl = /\bsrl\b/.test(blob) ? 'srl' : 'real';
  const norm = (n) => n.replace(/[^a-z0-9]/g, '');
  return `${gender}|${srl}|${[norm(t1), norm(t2)].sort().join('|')}`;
}

export async function fetchCricketMatches(type = 'live') {
  const matchMap = new Map();

  // 1. Fetch CREX (https://crex.com)
  try {
    const crexRes = await fetchCrexCricketMatches(type);
    if (crexRes?.matches?.length > 0) {
      for (const m of crexRes.matches) {
        const key = getPairKey(m);
        if (!matchMap.has(key)) {
          matchMap.set(key, m);
        }
      }
    }
  } catch (err) {
    console.warn('[Cricket Provider] CREX API error:', err.message);
  }

  // 2. Fetch Cricbuzz
  try {
    const cb = await fetchCricbuzzMatches();
    if (cb?.matches?.length) {
      let matches = cb.matches;
      if (type === 'live') matches = matches.filter(m => m.isLive || m.matchState === 'in');
      else if (type === 'upcoming' || type === 'scheduled') matches = matches.filter(m => m.matchState === 'pre');
      else if (type === 'completed') matches = matches.filter(m => m.matchState === 'post');

      for (const m of matches) {
        const norm = normalizeStandardMatch(m, 'cricbuzz-unofficial');
        const key = getPairKey(norm);
        if (!matchMap.has(key)) {
          matchMap.set(key, norm);
        }
      }
    }
  } catch (err) {
    console.warn('[Cricket Provider] Cricbuzz unofficial API error:', err.message);
  }

  const allMatches = [...matchMap.values()];

  return {
    provider: 'unified-cricket-provider',
    sourceType: 'crex_cricbuzz_cricapi_cricsheet',
    matches: allMatches,
  };
}
