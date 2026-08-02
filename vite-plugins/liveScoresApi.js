import { aggregateLiveScores } from '../lib/aggregator.mjs';

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
    },
  };
}
