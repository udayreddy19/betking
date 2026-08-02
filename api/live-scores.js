import { aggregateLiveScores } from '../lib/aggregator.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const force = req.query?.refresh === '1';
    const payload = await aggregateLiveScores({ force });

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(payload);
  } catch (error) {
    console.error('[Live Scores API]', error);
    return res.status(502).json({
      error: 'Failed to fetch live scores',
      message: error.message,
    });
  }
}
