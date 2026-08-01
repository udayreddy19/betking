import { launchCasinoGame } from '../lib/casinoLaunch.mjs';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const gameId = req.query?.gameId;
  if (!gameId || typeof gameId !== 'string') {
    return res.status(400).json({ error: 'gameId is required' });
  }

  try {
    const origin = req.headers.origin || req.headers.referer || 'https://betking-two.vercel.app';
    const lobbyUrl = `${origin.replace(/\/$/, '')}/casino`;
    const launch = await launchCasinoGame(gameId, { lobbyUrl });
    return res.status(200).json(launch);
  } catch (err) {
    console.error('[casino-launch]', err);
    return res.status(404).json({ error: err.message || 'Game launch failed' });
  }
}
