import { Router } from 'express';
import { requireAuth } from '../middleware/userAuth.js';
import { followMatch, unfollowMatch, listFollows } from '../../lib/matchFollowAlerts.mjs';

const router = Router();

router.get('/api/v1/user/follows', requireAuth, async (req, res) => {
  try {
    const rows = await listFollows(req.user.userId);
    res.json({ success: true, follows: rows });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/api/v1/user/follows', requireAuth, async (req, res) => {
  try {
    const result = await followMatch({
      userId: req.user.userId,
      matchId: req.body?.matchId,
      thresholdPct: req.body?.thresholdPct,
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.delete('/api/v1/user/follows/:matchId', requireAuth, async (req, res) => {
  try {
    const result = await unfollowMatch({ userId: req.user.userId, matchId: req.params.matchId });
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

export default router;
