import { aggregateLiveScores } from '../lib/aggregator.mjs';
import { fetchMatchDetail } from '../lib/matchDetailFetcher.mjs';
import { LIVE_SCORES_POLL_MS } from '../lib/livePolling.mjs';

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
    const payload = await aggregateLiveScores({ force });
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ...payload, pollIntervalMs: LIVE_SCORES_POLL_MS }));
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
    const matchId = url.searchParams.get('matchId') || url.searchParams.get('id');
    if (!matchId) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'matchId query param required' }));
      return;
    }

    const match = {
      id: matchId,
      sport: url.searchParams.get('sport') || 'cricket',
      source: url.searchParams.get('source') || '',
      league: url.searchParams.get('league') || '',
      cricbuzzMatchId: url.searchParams.get('cricbuzzMatchId')
        ? Number(url.searchParams.get('cricbuzzMatchId'))
        : undefined,
      espnEventId: url.searchParams.get('espnEventId') || undefined,
      espnPath: url.searchParams.get('espnPath') || undefined,
      fancodeMatchId: url.searchParams.get('fancodeMatchId') || undefined,
    };

    const fast = url.searchParams.get('fast') === '1';
    const detail = await fetchMatchDetail(match, { fast });

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
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: 'Failed to fetch match detail',
      message: error.message,
    }));
  }
}
