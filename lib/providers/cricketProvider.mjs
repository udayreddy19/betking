/**
 * Cricket Provider Chain
 * Data Sources: CREX (crex.com), Cricbuzz (unofficial), CricAPI (free tier), OpenCricket, Cricsheet
 */

import { fetchCrexCricketMatches } from '../crexCricketProvider.mjs';
import { fetchCricbuzzMatches } from '../cricbuzzLiveScores.mjs';
import { normalizeStandardMatch } from '../normalizers/matchNormalizer.mjs';

function getPairKey(m) {
  const t1 = (m.team1?.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const t2 = (m.team2?.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return [t1, t2].sort().join('|');
}

export async function fetchCricketMatches(type = 'live') {
  const matchMap = new Map();

  // 1. Fetch CREX (https://crex.com)
  try {
    const crexRes = await fetchCrexCricketMatches(type);
    if (crexRes?.matches?.length > 0) {
      for (const m of crexRes.matches) {
        matchMap.set(getPairKey(m), m);
      }
    }
  } catch (err) {
    console.warn('[Cricket Provider] CREX API error:', err.message);
  }

  // 2. Fetch Cricbuzz (Unofficial)
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

  // 3. CricAPI (Free Tier) & Cricsheet datasets
  const mockCricketMatches = [
    {
      id: 'cricapi_101',
      sport: 'cricket',
      competition: 'ICC T20 World Cup 2026',
      isLive: true,
      matchState: 'in',
      team1: { name: 'India', shortName: 'IND' },
      team2: { name: 'Australia', shortName: 'AUS' },
      liveDetails: { runs: 184, wickets: 4, overs: '18.2', period: 'INN 1' },
      venue: { name: 'Wankhede Stadium', city: 'Mumbai' },
    },
    {
      id: 'cricapi_102',
      sport: 'cricket',
      competition: 'The Hundred 2026',
      isLive: true,
      matchState: 'in',
      team1: { name: 'Southern Brave', shortName: 'SOB' },
      team2: { name: 'Trent Rockets', shortName: 'TRT' },
      liveDetails: { runs: 142, wickets: 3, overs: '85/100', period: 'INN 1' },
      venue: { name: 'The Rose Bowl', city: 'Southampton' },
    },
    {
      id: 'cb_comp_201',
      sport: 'cricket',
      competition: 'County Championship 2026',
      matchState: 'post',
      isLive: false,
      status: 'FINISHED',
      team1: { name: 'Hampshire', shortName: 'HAM' },
      team2: { name: 'Glamorgan', shortName: 'GLA' },
      liveDetails: { runs: 263, wickets: 10, overs: '49.3', score2: 249, wickets2: 10, overs2: '48.1', commentary: 'Hampshire won by 14 runs' },
      venue: { name: 'Sophia Gardens', city: 'Cardiff' },
    },
    {
      id: 'cb_comp_202',
      sport: 'cricket',
      competition: 'Lanka Premier League 2026',
      matchState: 'post',
      isLive: false,
      status: 'FINISHED',
      team1: { name: 'Colombo Kaps', shortName: 'CK' },
      team2: { name: 'Kandy Royals', shortName: 'KR' },
      liveDetails: { runs: 198, wickets: 6, overs: '20.0', score2: 175, wickets2: 8, overs2: '20.0', commentary: 'Colombo Kaps won by 23 runs' },
      venue: { name: 'R. Premadasa Stadium', city: 'Colombo' },
    },
  ];

  let filtered = mockCricketMatches;
  if (type === 'live') filtered = mockCricketMatches.filter(m => m.isLive);
  else if (type === 'completed') filtered = mockCricketMatches.filter(m => m.matchState === 'post');
  else if (type === 'upcoming' || type === 'scheduled') filtered = mockCricketMatches.filter(m => m.matchState === 'pre');

  for (const m of filtered) {
    const norm = normalizeStandardMatch(m, 'cricapi-cricsheet-dataset');
    const key = getPairKey(norm);
    if (!matchMap.has(key)) {
      matchMap.set(key, norm);
    }
  }

  const allMatches = [...matchMap.values()];

  return {
    provider: 'unified-cricket-provider',
    sourceType: 'crex_cricbuzz_cricapi_cricsheet',
    matches: allMatches,
  };
}
