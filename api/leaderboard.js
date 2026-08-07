import { getLeaderboards } from '../lib/leaderboardEngine.mjs';

export default async function handler(req, res) {
  try {
    const leaderboards = getLeaderboards();
    return res.status(200).json({ success: true, leaderboards });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
