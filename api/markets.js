import { generateDynamicMatchMarkets, getAllMarketConfigs } from '../lib/marketEngine.mjs';

export default async function handler(req, res) {
  try {
    const matchId = req.query?.matchId || 'cb_169497';
    const sport = req.query?.sport || 'cricket';

    const matchMarkets = generateDynamicMatchMarkets({ id: matchId, sport });
    const marketConfigs = getAllMarketConfigs();

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ success: true, matchId, totalMarkets: matchMarkets.totalMarketsCount, markets: matchMarkets.markets, configs: marketConfigs });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
