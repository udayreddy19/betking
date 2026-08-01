import { fetchFanCodeLiveScores } from '../lib/fancodeLiveScores.mjs';

export function fancodeApiPlugin() {
  return {
    name: 'fancode-api',
    configureServer(server) {
      server.middlewares.use('/api/fancode/live-scores', async (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        try {
          const payload = await fetchFanCodeLiveScores();
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(payload));
        } catch (error) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            error: 'Failed to fetch FanCode live scores',
            message: error.message,
          }));
        }
      });
    },
  };
}
