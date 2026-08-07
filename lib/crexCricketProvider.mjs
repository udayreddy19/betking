/**
 * CREX Cricket Provider (https://crex.com / CREX Live)
 * Real-time live cricket scores, ball-by-ball commentary, rosters & player stats.
 */

import { normalizeStandardMatch } from './normalizers/matchNormalizer.mjs';

const CREX_LIVE_URL = 'https://crex.com/live-cricket-scores';
const CREX_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/json',
  'Referer': 'https://crex.com/',
};

export async function fetchCrexCricketMatches(type = 'live') {
  try {
    const res = await fetch(CREX_LIVE_URL, { headers: CREX_HEADERS, cache: 'no-store' });
    if (res.ok) {
      const html = await res.text();
      const matches = parseCrexHtmlPayload(html, type);
      if (matches.length > 0) {
        return {
          provider: 'crex-live',
          sourceType: 'live_scores_ball_by_ball_commentary',
          matches: matches.map(m => normalizeStandardMatch(m, 'crex-live')),
        };
      }
    }
  } catch (err) {
    console.warn('[CREX Provider] Live fetch error:', err.message);
  }

  return {
    provider: 'crex-live',
    sourceType: 'live_scores_ball_by_ball_commentary',
    matches: [],
  };
}

function parseCrexHtmlPayload(html, type) {
  try {
    const jsonMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
    if (jsonMatch && jsonMatch[1]) {
      const data = JSON.parse(jsonMatch[1]);
      const pageProps = data?.props?.pageProps;
      const liveList = pageProps?.matches || pageProps?.liveMatches || [];
      return liveList.map(m => ({
        id: `crex_${m.id || m.matchId}`,
        sport: 'cricket',
        competition: m.seriesName || m.league || 'CREX Live Cricket',
        isLive: m.status === 'live' || m.matchState === 'in',
        matchState: m.status === 'live' ? 'in' : (m.status === 'completed' ? 'post' : 'pre'),
        team1: { name: m.team1?.name || m.homeTeam, shortName: m.team1?.sName || 'T1' },
        team2: { name: m.team2?.name || m.awayTeam, shortName: m.team2?.sName || 'T2' },
        liveDetails: {
          runs: m.team1Score?.runs || 0,
          wickets: m.team1Score?.wickets || 0,
          overs: m.team1Score?.overs || '0.0',
          score2: m.team2Score?.runs || 0,
          wickets2: m.team2Score?.wickets || 0,
          overs2: m.team2Score?.overs || '0.0',
          commentary: m.statusText || m.commentary || 'CREX Live Match Update',
        },
        venue: { name: m.venue || 'Stadium', city: m.city || '' },
      }));
    }
  } catch {
    // Ignore html parse errors
  }
  return [];
}
