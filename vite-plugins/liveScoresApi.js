import { aggregateLiveScores } from '../lib/aggregator.mjs';
import { fetchCricbuzzMatchDetailCached } from '../lib/cricbuzzMatchDetail.mjs';

const detailCache = new Map();
const DETAIL_TTL_MS = 1000;

async function getMatchDetail(matchId) {
  const cached = detailCache.get(matchId);
  if (cached && Date.now() - cached.at < DETAIL_TTL_MS) return cached.data;
  const detail = await fetchCricbuzzMatchDetailCached(matchId);
  detailCache.set(matchId, { data: detail, at: Date.now() });
  return detail;
}

export function liveScoresApiPlugin() {
  return {
    name: 'live-scores-api',
    configureServer(server) {
      server.middlewares.use('/api/live-scores', async (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        try {
          const url = new URL(req.url, 'http://localhost');
          const force = !!(url.searchParams.get('_') || url.searchParams.get('refresh'));
          const payload = await aggregateLiveScores({ force });
          res.setHeader('Content-Type', 'application/json');
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
      });

      server.middlewares.use('/api/match-detail', async (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        try {
          const url = new URL(req.url, 'http://localhost');
          const matchId = url.searchParams.get('id') || url.searchParams.get('matchId');
          if (!matchId) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'matchId query param required' }));
            return;
          }

          const detail = await getMatchDetail(matchId);
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
      });
    },
  };
}
