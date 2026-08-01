import { fetchFanCodeLiveScores } from '../lib/fancodeLiveScores.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = await fetchFanCodeLiveScores();
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
    return res.status(200).json(payload);
  } catch (error) {
    console.error('[FanCode API]', error);
    return res.status(502).json({
      error: 'Failed to fetch FanCode live scores',
      message: error.message,
    });
  }
}
