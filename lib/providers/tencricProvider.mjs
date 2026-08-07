/**
 * 10Cric Provider (https://www.10cric2026.com/live-betting/ & https://www.10cric2026.com/cricket/)
 * Fetches Live Scores, Match Metadata & Betting Odds directly from 10Cric 2026 Live Betting & Cricket endpoints
 */

import { toCanonicalMatch, toCanonicalOdds } from '../normalizers/canonicalModel.mjs';

const TENCRIC_LIVE_BETTING_URL = 'https://www.10cric2026.com/live-betting/';
const TENCRIC_CRICKET_URL = 'https://www.10cric2026.com/cricket/';
const TENCRIC_LIVE_BETTING_API_URL = 'https://www.10cric2026.com/api/v1/sports/live-betting';
const TENCRIC_API_URL = 'https://www.10cric2026.com/api/v1/cricket/live';

const TENCRIC_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/html, application/xhtml+xml',
  'Referer': 'https://www.10cric2026.com/live-betting/',
};

/**
 * Fetch live scores & odds from 10Cric 2026 Live Betting & Cricket sources
 */
export async function fetch10CricLiveScores() {
  const matchMap = new Map();

  // 1. Try 10Cric Live Betting JSON API endpoint
  try {
    const res = await fetch(TENCRIC_LIVE_BETTING_API_URL, {
      headers: TENCRIC_HEADERS,
      signal: AbortSignal.timeout(3000),
    });

    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('json')) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data?.matches || data?.data || data?.events || []);
        for (const m of list) {
          const norm = normalize10CricMatch(m);
          matchMap.set(norm.matchId, norm);
        }
      }
    }
  } catch (err) {
    console.warn('[10Cric Provider] Live betting API notice:', err.message);
  }

  // 2. Try 10Cric Cricket JSON API endpoint
  try {
    const res = await fetch(TENCRIC_API_URL, {
      headers: TENCRIC_HEADERS,
      signal: AbortSignal.timeout(3000),
    });

    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('json')) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data?.matches || data?.data || []);
        for (const m of list) {
          const norm = normalize10CricMatch(m);
          if (!matchMap.has(norm.matchId)) {
            matchMap.set(norm.matchId, norm);
          }
        }
      }
    }
  } catch (err) {
    console.warn('[10Cric Provider] Cricket API notice:', err.message);
  }

  // 3. Try 10Cric Live Betting HTML Page (https://www.10cric2026.com/live-betting/)
  try {
    const res = await fetch(TENCRIC_LIVE_BETTING_URL, {
      headers: TENCRIC_HEADERS,
      signal: AbortSignal.timeout(3000),
    });

    if (res.ok) {
      const html = await res.text();
      const parsed = parse10CricHtml(html);
      for (const m of parsed) {
        const norm = normalize10CricMatch(m);
        if (!matchMap.has(norm.matchId)) {
          matchMap.set(norm.matchId, norm);
        }
      }
    }
  } catch (err) {
    console.warn('[10Cric Provider] Live betting HTML scrape notice:', err.message);
  }

  // 4. Try 10Cric Cricket HTML Page (https://www.10cric2026.com/cricket/)
  try {
    const res = await fetch(TENCRIC_CRICKET_URL, {
      headers: TENCRIC_HEADERS,
      signal: AbortSignal.timeout(3000),
    });

    if (res.ok) {
      const html = await res.text();
      const parsed = parse10CricHtml(html);
      for (const m of parsed) {
        const norm = normalize10CricMatch(m);
        if (!matchMap.has(norm.matchId)) {
          matchMap.set(norm.matchId, norm);
        }
      }
    }
  } catch (err) {
    console.warn('[10Cric Provider] Cricket HTML scrape notice:', err.message);
  }

  return Array.from(matchMap.values());
}

/**
 * Fetch betting odds for a match from 10Cric 2026 source
 */
export async function fetch10CricOdds(matchId) {
  try {
    const res = await fetch(`https://www.10cric2026.com/api/v1/odds/${matchId}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(2000),
    });

    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('json')) {
        const data = await res.json();
        return toCanonicalOdds(data);
      }
    }
  } catch (err) {
    console.warn('[10Cric Provider] Odds fetch notice:', err.message);
  }

  return null;
}

function parse10CricHtml(html) {
  try {
    const scriptMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
    if (scriptMatch && scriptMatch[1]) {
      const data = JSON.parse(scriptMatch[1]);
      const pageProps = data?.props?.pageProps;
      const list = pageProps?.matches || pageProps?.events || pageProps?.liveEvents || pageProps?.liveBettingMatches || [];
      return list;
    }
  } catch {
    // Ignore parse errors
  }
  return [];
}

function normalize10CricMatch(m) {
  return toCanonicalMatch({
    matchId: m.matchId || `10cric_${m.id || Date.now()}`,
    matchName: m.name || (m.homeTeam?.name && m.awayTeam?.name ? `${m.homeTeam.name} vs ${m.awayTeam.name}` : null),
    sport: m.sport || 'cricket',
    league: m.league || m.series || null,
    homeTeam: {
      teamName: m.homeTeam?.name || m.team1 || null,
      shortName: m.homeTeam?.shortName || m.team1Short || null,
    },
    awayTeam: {
      teamName: m.awayTeam?.name || m.team2 || null,
      shortName: m.awayTeam?.shortName || m.team2Short || null,
    },
    liveStatus: m.isLive ? 'IN_PROGRESS' : 'COMPLETED',
    liveScore: {
      runs: m.score1 ?? m.liveDetails?.runs ?? null,
      wickets: m.wickets1 ?? m.liveDetails?.wickets ?? null,
      overs: m.overs1 ?? m.liveDetails?.overs ?? null,
      score2: m.score2 ?? m.liveDetails?.score2 ?? null,
      wickets2: m.wickets2 ?? m.liveDetails?.wickets2 ?? null,
      overs2: m.overs2 ?? m.liveDetails?.overs2 ?? null,
      time: m.time || null,
    },
    odds: m.odds ? {
      winner: {
        home: m.odds.home || null,
        away: m.odds.away || null,
      },
      overUnder: m.odds.overUnder || null,
    } : null,
    provider: '10cric2026',
  });
}
