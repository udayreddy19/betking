import { calculateDynamicMatchOdds } from '../lib/oddsEngine.mjs';
import { calculateMatchProbability } from '../lib/probabilityEngine.mjs';

export default async function handler(req, res) {
  try {
    const matchId = req.query?.matchId || 'cb_169497';
    const prob = calculateMatchProbability({ matchId, sport: 'cricket', homeElo: 1550, awayElo: 1680, isLive: true });
    const odds = calculateDynamicMatchOdds({ id: matchId, sport: 'cricket', homeElo: 1550, awayElo: 1680, isLive: true });

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ success: true, matchId, probabilities: prob, odds: odds.odds, version: odds.version, publishedAt: odds.publishedAt });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
