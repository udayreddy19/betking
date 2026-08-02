import { fetchMatchDetail } from '../lib/matchDetailFetcher.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const q = req.query || {};
  const matchId = q.matchId || q.id;
  if (!matchId) {
    return res.status(400).json({ error: 'matchId query param required' });
  }

  const fast = q.fast === '1' || q.fast === 'true';

  const match = {
    id: matchId,
    sport: q.sport || 'cricket',
    source: q.source || '',
    league: q.league || '',
    cricbuzzMatchId: q.cricbuzzMatchId ? Number(q.cricbuzzMatchId) : undefined,
    espnEventId: q.espnEventId || undefined,
    espnPath: q.espnPath || undefined,
    fancodeMatchId: q.fancodeMatchId || undefined,
  };

  try {
    const detail = await fetchMatchDetail(match, { fast });
    if (!detail) {
      return res.status(404).json({ error: 'No detail source for this match' });
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(detail);
  } catch (error) {
    console.error('[Match Detail API]', error);
    return res.status(502).json({
      error: 'Failed to fetch match detail',
      message: error.message,
    });
  }
}
