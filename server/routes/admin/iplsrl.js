/**
 * Admin IPLSRL Control Routes
 */

import { Router } from 'express';

const router = Router();

router.get('/control', async (req, res) => {
  try {
    const { getIPLSRLControlSnapshot } = await import('../../../lib/iplSrlAdminControl.mjs');
    res.json(getIPLSRLControlSnapshot());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/settings', async (req, res) => {
  try {
    const { updateIPLSRLGlobalSettings } = await import('../../../lib/iplSrlAdminControl.mjs');
    res.json(updateIPLSRLGlobalSettings({ ...req.body, admin: req.admin?.id || 'admin' }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/matches/:matchId/winner', async (req, res) => {
  try {
    const { setIPLSRLForcedWinner, clearIPLSRLForcedWinner } = await import('../../../lib/iplSrlAdminControl.mjs');
    const admin = req.admin?.id || 'admin';
    const snap = req.body?.teamId
      ? setIPLSRLForcedWinner(req.params.matchId, req.body.teamId, admin)
      : clearIPLSRLForcedWinner(req.params.matchId, admin);
    res.json(snap);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/matches/start', async (req, res) => {
  try {
    const { startIPLSRLControlledMatch } = await import('../../../lib/iplSrlAdminControl.mjs');
    if (!req.body?.matchId) return res.status(400).json({ error: 'matchId required' });
    const snap = startIPLSRLControlledMatch(req.body.matchId, { admin: req.admin?.id || 'admin' });
    res.json({ success: true, ...snap });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/matches/pause', async (req, res) => {
  try {
    const { pauseIPLSRLControlledMatch } = await import('../../../lib/iplSrlAdminControl.mjs');
    if (!req.body?.matchId) return res.status(400).json({ error: 'matchId required' });
    const snap = pauseIPLSRLControlledMatch(req.body.matchId, { admin: req.admin?.id || 'admin' });
    res.json({ success: true, ...snap });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/matches/resume', async (req, res) => {
  try {
    const { resumeIPLSRLControlledMatch } = await import('../../../lib/iplSrlAdminControl.mjs');
    if (!req.body?.matchId) return res.status(400).json({ error: 'matchId required' });
    const snap = resumeIPLSRLControlledMatch(req.body.matchId, {
      admin: req.admin?.id || 'admin',
      autoPlay: req.body?.autoPlay !== false,
    });
    res.json({ success: true, ...snap });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/matches/speed', async (req, res) => {
  try {
    const { setIPLSRLMatchSpeed } = await import('../../../lib/iplSrlAdminControl.mjs');
    const { matchId, speed } = req.body || {};
    if (!matchId || !speed) return res.status(400).json({ error: 'matchId and speed required' });
    res.json(setIPLSRLMatchSpeed(matchId, speed, req.admin?.id || 'admin'));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/matches/delivery', async (req, res) => {
  try {
    const { triggerDelivery } = await import('../../../lib/iplSrlAdminControl.mjs');
    if (!req.body?.matchId) return res.status(400).json({ error: 'matchId required' });
    const result = triggerDelivery(req.body.matchId, { admin: req.admin?.id || 'admin' });
    res.json({ success: true, delivery: result.delivery, ...result.snapshot });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/teams/:teamId/rating', async (req, res) => {
  try {
    const { updateTeamStrength } = await import('../../../lib/iplSrlAdminControl.mjs');
    res.json(updateTeamStrength(req.params.teamId, req.body?.strengthRating, req.admin?.id || 'admin'));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/teams', async (req, res) => {
  try {
    const { adminCreateTeam } = await import('../../../lib/iplSrlAdminControl.mjs');
    res.json(await adminCreateTeam(req.body || {}, req.admin?.id || 'admin'));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/players', async (req, res) => {
  try {
    const { adminCreatePlayer } = await import('../../../lib/iplSrlAdminControl.mjs');
    res.json(await adminCreatePlayer(req.body || {}, req.admin?.id || 'admin'));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/players/:playerId', async (req, res) => {
  try {
    const { adminUpdatePlayer } = await import('../../../lib/iplSrlAdminControl.mjs');
    res.json(await adminUpdatePlayer(req.params.playerId, req.body || {}, req.admin?.id || 'admin'));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
