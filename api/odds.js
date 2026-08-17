import { buildMatchOddsPayload } from '../lib/liveScoresApiHandlers.mjs';

export default async function handler(req, res) {
  try {
    const matchId = req.query?.matchId || 'cb_169497';
    const payload = await buildMatchOddsPayload({
      matchId,
      team1: req.query?.team1,
      team2: req.query?.team2,
      force: req.query?.refresh === '1',
    });

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(payload);
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ success: false, status: 'NOT_AVAILABLE', error: err.message });
  }
}
