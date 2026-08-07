import { getUserRiskSummary } from '../lib/riskEngine.mjs';

export default async function handler(req, res) {
  try {
    const userId = req.query?.userId || 'usr_demo';
    const summary = getUserRiskSummary(userId);
    return res.status(200).json({ success: true, summary });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
