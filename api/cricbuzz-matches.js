import { fetchCricbuzzMatches } from '../lib/cricbuzzLiveScores.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = await fetchCricbuzzMatches();
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    return res.status(200).json(payload);
  } catch (error) {
    console.error('[Cricbuzz API]', error);
    return res.status(502).json({
      error: 'Failed to fetch Cricbuzz matches',
      message: error.message,
    });
  }
}
