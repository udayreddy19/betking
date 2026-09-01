import {
  buildLiveScoresPayload,
  buildMatchDetailPayload,
  buildMatchOddsPayload,
} from '../lib/liveScoresApiHandlers.mjs';
import { parseLiveOddsOverlayFromQuery } from '../lib/matchOddsStateKey.mjs';

const MATCH_ODDS_RE = /^\/api\/public\/sports\/matches\/([^/]+)\/odds$/;

export function liveScoresApiPlugin() {
  return {
    name: 'live-scores-api',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0];
        if (url === '/api/live-scores') {
          handleLiveScores(req, res);
          return;
        }
        if (url === '/api/match-detail') {
          handleMatchDetail(req, res);
          return;
        }
        const oddsMatch = url?.match(MATCH_ODDS_RE);
        if (oddsMatch) {
          handleMatchOdds(req, res, decodeURIComponent(oddsMatch[1]));
          return;
        }
        next();
      });
    },
  };
}

async function handleLiveScores(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const url = new URL(req.url, 'http://localhost');
    const force = url.searchParams.get('refresh') === '1';
    const payload = await buildLiveScoresPayload({ force });
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', force ? 'no-store' : 'public, max-age=1, stale-while-revalidate=2');
    res.end(JSON.stringify(payload));
  } catch (error) {
    console.error('[Live Scores Plugin]', error);
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: 'Failed to fetch live scores',
      message: error.message,
    }));
  }
}

async function handleMatchDetail(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const url = new URL(req.url, 'http://localhost');
    const get = (key) => url.searchParams.get(key);
    const fast = get('fast') === '1';
    const detail = await buildMatchDetailPayload(get, { fast });

    if (!detail) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'No detail source for this match' }));
      return;
    }

    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(detail));
  } catch (error) {
    console.error('[Match Detail Plugin]', error);
    res.statusCode = error.statusCode || 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: error.statusCode === 400 ? error.message : 'Failed to fetch match detail',
      message: error.message,
    }));
  }
}

async function handleMatchOdds(req, res, matchId) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const url = new URL(req.url, 'http://localhost');
    const payload = await buildMatchOddsPayload({
      matchId,
      team1: url.searchParams.get('team1') || undefined,
      team2: url.searchParams.get('team2') || undefined,
      force: url.searchParams.get('refresh') === '1',
      stateKey: url.searchParams.get('stateKey') || '',
      overlay: parseLiveOddsOverlayFromQuery(Object.fromEntries(url.searchParams.entries())),
    });
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
  } catch (error) {
    console.error('[Match Odds Plugin]', error);
    res.statusCode = error.statusCode || 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: false,
      status: 'NOT_AVAILABLE',
      error: error.statusCode === 400 ? error.message : 'Failed to retrieve authoritative match odds',
      message: error.message,
    }));
  }
}
