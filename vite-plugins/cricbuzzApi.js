import { fetchCricbuzzMatches } from '../lib/cricbuzzLiveScores.mjs';

export function cricbuzzApiPlugin() {
  return {
    name: 'cricbuzz-api',
    configureServer(server) {
      server.middlewares.use('/api/cricbuzz/matches', async (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        try {
          const payload = await fetchCricbuzzMatches();
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(payload));
        } catch (error) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            error: 'Failed to fetch Cricbuzz matches',
            message: error.message,
          }));
        }
      });
    },
  };
}
