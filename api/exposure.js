import { getSystemWideExposureSummary, calculateMatchExposureMetrics } from '../lib/exposureEngine.mjs';

export default async function handler(req, res) {
  try {
    const matchId = req.query?.matchId;
    if (matchId) {
      const matchMetrics = calculateMatchExposureMetrics(matchId);
      return res.status(200).json({ success: true, matchMetrics });
    }

    const globalSummary = getSystemWideExposureSummary();
    return res.status(200).json({ success: true, globalSummary });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
