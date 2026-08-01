import { launchCasinoGame } from '../lib/casinoLaunch.mjs';

export function casinoApiPlugin() {
  return {
    name: 'casino-api',
    configureServer(server) {
      server.middlewares.use('/api/casino/launch', async (req, res) => {
        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }

        const url = new URL(req.url, 'http://localhost');
        const gameId = url.searchParams.get('gameId');

        if (!gameId) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'gameId is required' }));
          return;
        }

        try {
          const launch = await launchCasinoGame(gameId, {
            lobbyUrl: 'http://localhost:5173/casino',
          });
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(launch));
        } catch (err) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    },
  };
}
