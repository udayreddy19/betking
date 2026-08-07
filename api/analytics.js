import { getSystemAnalyticsSummary } from '../lib/analytics/analyticsEngine.mjs';

export default async function handler(req, res) {
  try {
    const summary = getSystemAnalyticsSummary();
    return res.status(200).json({ success: true, analytics: summary });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
