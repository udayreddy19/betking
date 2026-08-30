import { Router } from 'express';
import {
  buildLiveScoresPayload,
  buildMatchDetailPayload,
} from '../../../lib/liveScoresApiHandlers.mjs';
import { requireAuth } from '../../middleware/userAuth.js';

const router = Router();

router.get('/live-scores', requireAuth, async (req, res) => {
  try {
    const force = req.query.refresh === '1';
    const payload = await buildLiveScoresPayload({ force });
    res.json(payload);
  } catch (error) {
    console.error('[Live Scores]', error);
    res.status(502).json({
      error: 'Failed to fetch live scores',
      message: error.message,
    });
  }
});

router.get('/match-detail', requireAuth, async (req, res) => {
  try {
    const get = (key) => {
      const value = req.query[key];
      return Array.isArray(value) ? value[0] : value;
    };
    const fast = get('fast') === '1';
    const detail = await buildMatchDetailPayload(get, { fast });
    if (!detail) {
      res.status(404).json({ error: 'No detail source for this match' });
      return;
    }
    res.json(detail);
  } catch (error) {
    const status = error.statusCode || 502;
    console.error('[Match Detail]', error);
    res.status(status).json({
      error: status === 400 ? error.message : 'Failed to fetch match detail',
      message: error.message,
    });
  }
});

export default router;
