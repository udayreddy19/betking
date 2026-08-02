import { aggregateLiveScores } from '../lib/aggregator.mjs';
import { fetchCricbuzzMatchDetail } from '../lib/cricbuzzMatchDetail.mjs';

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
          const payload = await aggregateLiveScores();
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

          const detail = await fetchCricbuzzMatchDetail(matchId);
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
