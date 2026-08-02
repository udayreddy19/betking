import { aggregateLiveScores } from '../lib/aggregator.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = await aggregateLiveScores();

    // Cache for 30s at the CDN edge, serve stale for up to 60s while revalidating
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    return res.status(200).json(payload);
  } catch (error) {
    console.error('[Live Scores API]', error);
    return res.status(502).json({
      error: 'Failed to fetch live scores',
      message: error.message,
    });
  }
}
