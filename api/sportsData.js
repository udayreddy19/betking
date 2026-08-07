import { aggregateLiveScores } from '../lib/aggregator.mjs';

export default async function handler(req, res) {
  try {
    const scores = await aggregateLiveScores();
    res.setHeader('Cache-Control', 'public, max-age=3');
    return res.status(200).json({
      success: true,
      apiVersion: 'v2.0-ENTERPRISE',
      data: {
        matches: scores.matches || [],
        series: scores.series || [],
        timestamp: Date.now(),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
