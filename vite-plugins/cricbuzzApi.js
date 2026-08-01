import { handleCricbuzzRequest } from '../lib/cricbuzzHandler.js';

export function cricbuzzApiPlugin() {
  return {
    name: 'cricbuzz-api',
    configureServer(server) {
      server.middlewares.use('/api/cricbuzz', async (req, res) => {
        try {
          const url = new URL(req.url, 'http://localhost');
          const query = Object.fromEntries(url.searchParams.entries());
          const result = await handleCricbuzzRequest(query);

          res.setHeader('Content-Type', 'application/json');
          res.statusCode = result.status || 200;
          res.end(JSON.stringify(result.error ? { error: result.error } : result.data));
        } catch (err) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message || 'Cricbuzz proxy error' }));
        }
      });
    },
  };
}
