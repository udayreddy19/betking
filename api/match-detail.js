import { fetchCricbuzzMatchDetail } from '../lib/cricbuzzMatchDetail.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const matchId = req.query?.id || req.query?.matchId;
  if (!matchId) {
    return res.status(400).json({ error: 'matchId query param required' });
  }

  try {
    const detail = await fetchCricbuzzMatchDetail(matchId);
    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=20');
    return res.status(200).json(detail);
  } catch (error) {
    console.error('[Match Detail API]', error);
    return res.status(502).json({
      error: 'Failed to fetch match detail',
      message: error.message,
    });
  }
}
