/**
 * Admin IPLSRL Control Routes
 */

import { Router } from 'express';
import { requireRole } from '../../middleware/adminAuth.js';

const router = Router();

const iplsrlRoles = requireRole('SUPER_ADMIN', 'TRADING_ADMIN', 'OPERATIONS_ADMIN');

async function jsonSnap(res, payload) {
  const { enrichSnapshotWithStakes } = await import('../../../lib/iplSrlAdminControl.mjs');
  res.json(await enrichSnapshotWithStakes(payload));
}

router.get('/control', iplsrlRoles, async (req, res) => {
  try {
    const { getIPLSRLControlSnapshot } = await import('../../../lib/iplSrlAdminControl.mjs');
    await jsonSnap(res, getIPLSRLControlSnapshot());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/settings', iplsrlRoles, async (req, res) => {
  try {
    const { updateIPLSRLGlobalSettings } = await import('../../../lib/iplSrlAdminControl.mjs');
    await jsonSnap(res, updateIPLSRLGlobalSettings({ ...req.body, admin: req.admin?.id || 'admin' }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/matches/:matchId/declare', iplsrlRoles, async (req, res) => {
  try {
    const { declareIPLSRLWinner } = await import('../../../lib/iplSrlAdminControl.mjs');
    if (!req.body?.teamId) return res.status(400).json({ error: 'teamId required' });
    await jsonSnap(res, declareIPLSRLWinner(req.params.matchId, req.body.teamId, req.admin?.id || 'admin'));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/matches/:matchId/markets', iplsrlRoles, async (req, res) => {
  try {
    const { getIPLSRLMatchMarkets } = await import('../../../lib/iplSrlAdminControl.mjs');
    const data = await getIPLSRLMatchMarkets(req.params.matchId);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/matches/:matchId/markets/:marketId/suspend', iplsrlRoles, async (req, res) => {
  try {
    const { setIPLSRLMarketSuspended } = await import('../../../lib/iplSrlAdminControl.mjs');
    const suspended = req.body?.suspended !== false;
    const data = await setIPLSRLMarketSuspended(
      req.params.matchId,
      decodeURIComponent(req.params.marketId),
      suspended,
      req.admin?.id || 'admin',
    );
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/matches/:matchId/markets/:marketId/declare', iplsrlRoles, async (req, res) => {
  try {
    const { declareIPLSRLMarketOutcome } = await import('../../../lib/iplSrlAdminControl.mjs');
    const data = await declareIPLSRLMarketOutcome(req.params.matchId, {
      marketId: decodeURIComponent(req.params.marketId),
      winningSelectionId: req.body?.winningSelectionId || req.body?.selectionId || null,
      voidMarket: !!req.body?.voidMarket,
      admin: req.admin?.id || 'admin',
    });
    const { enrichSnapshotWithStakes } = await import('../../../lib/iplSrlAdminControl.mjs');
    if (data.snapshot) {
      data.snapshot = await enrichSnapshotWithStakes(data.snapshot);
    }
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/matches/:matchId/force-winner', iplsrlRoles, async (req, res) => {
  try {
    const { setIPLSRLForcedWinner, clearIPLSRLForcedWinner } = await import('../../../lib/iplSrlAdminControl.mjs');
    const admin = req.admin?.id || 'admin';
    const snap = req.body?.teamId
      ? setIPLSRLForcedWinner(req.params.matchId, req.body.teamId, admin)
      : clearIPLSRLForcedWinner(req.params.matchId, admin);
    await jsonSnap(res, snap);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/matches/start', iplsrlRoles, async (req, res) => {
  try {
    const { startIPLSRLControlledMatch } = await import('../../../lib/iplSrlAdminControl.mjs');
    if (!req.body?.matchId) return res.status(400).json({ error: 'matchId required' });
    const snap = startIPLSRLControlledMatch(req.body.matchId, { admin: req.admin?.id || 'admin' });
    await jsonSnap(res, { success: true, ...snap });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/matches/pause', iplsrlRoles, async (req, res) => {
  try {
    const { pauseIPLSRLControlledMatch } = await import('../../../lib/iplSrlAdminControl.mjs');
    if (!req.body?.matchId) return res.status(400).json({ error: 'matchId required' });
    const snap = pauseIPLSRLControlledMatch(req.body.matchId, { admin: req.admin?.id || 'admin' });
    await jsonSnap(res, { success: true, ...snap });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/matches/resume', iplsrlRoles, async (req, res) => {
  try {
    const { resumeIPLSRLControlledMatch } = await import('../../../lib/iplSrlAdminControl.mjs');
    if (!req.body?.matchId) return res.status(400).json({ error: 'matchId required' });
    const snap = resumeIPLSRLControlledMatch(req.body.matchId, {
      admin: req.admin?.id || 'admin',
      autoPlay: req.body?.autoPlay !== false,
    });
    await jsonSnap(res, { success: true, ...snap });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/matches/speed', iplsrlRoles, async (req, res) => {
  try {
    const { setIPLSRLMatchSpeed } = await import('../../../lib/iplSrlAdminControl.mjs');
    const { matchId, speed } = req.body || {};
    if (!matchId || !speed) return res.status(400).json({ error: 'matchId and speed required' });
    await jsonSnap(res, setIPLSRLMatchSpeed(matchId, speed, req.admin?.id || 'admin'));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/matches/seek', iplsrlRoles, async (req, res) => {
  try {
    const { seekIPLSRLMatch } = await import('../../../lib/iplSrlAdminControl.mjs');
    const { matchId, elapsedMs, deltaMs, marker, pause } = req.body || {};
    if (!matchId) return res.status(400).json({ error: 'matchId required' });
    await jsonSnap(res, seekIPLSRLMatch(matchId, { elapsedMs, deltaMs, marker, pause }, req.admin?.id || 'admin'));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/matches/reset', iplsrlRoles, async (req, res) => {
  try {
    const { resetIPLSRLMatch } = await import('../../../lib/iplSrlAdminControl.mjs');
    if (!req.body?.matchId) return res.status(400).json({ error: 'matchId required' });
    await jsonSnap(res, resetIPLSRLMatch(req.body.matchId, req.admin?.id || 'admin'));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/matches/betting', iplsrlRoles, async (req, res) => {
  try {
    const { setIPLSRLBettingClosed } = await import('../../../lib/iplSrlAdminControl.mjs');
    if (!req.body?.matchId) return res.status(400).json({ error: 'matchId required' });
    await jsonSnap(res, setIPLSRLBettingClosed(req.body.matchId, !!req.body.closed, req.admin?.id || 'admin'));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/season/jump', iplsrlRoles, async (req, res) => {
  try {
    const { jumpIPLSRLSeason } = await import('../../../lib/iplSrlAdminControl.mjs');
    await jsonSnap(res, jumpIPLSRLSeason({
      matchNo: req.body?.matchNo,
      at: req.body?.at,
    }, req.admin?.id || 'admin'));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/season/reset-clock', iplsrlRoles, async (req, res) => {
  try {
    const { resetIPLSRLSeasonClock } = await import('../../../lib/iplSrlAdminControl.mjs');
    await jsonSnap(res, resetIPLSRLSeasonClock(req.admin?.id || 'admin'));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/matches/delivery', iplsrlRoles, async (req, res) => {
  try {
    const { triggerDelivery } = await import('../../../lib/iplSrlAdminControl.mjs');
    if (!req.body?.matchId) return res.status(400).json({ error: 'matchId required' });
    const result = triggerDelivery(req.body.matchId, { admin: req.admin?.id || 'admin' });
    await jsonSnap(res, { success: true, delivery: result.delivery, ...result.snapshot });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/teams/:teamId/rating', iplsrlRoles, async (req, res) => {
  try {
    const { updateTeamStrength } = await import('../../../lib/iplSrlAdminControl.mjs');
    await jsonSnap(res, updateTeamStrength(req.params.teamId, req.body?.strengthRating, req.admin?.id || 'admin'));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/teams', iplsrlRoles, async (req, res) => {
  try {
    const { adminCreateTeam } = await import('../../../lib/iplSrlAdminControl.mjs');
    const result = await adminCreateTeam(req.body || {}, req.admin?.id || 'admin');
    await jsonSnap(res, result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/players', iplsrlRoles, async (req, res) => {
  try {
    const { adminCreatePlayer } = await import('../../../lib/iplSrlAdminControl.mjs');
    const result = await adminCreatePlayer(req.body || {}, req.admin?.id || 'admin');
    await jsonSnap(res, result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/players/:playerId', iplsrlRoles, async (req, res) => {
  try {
    const { adminUpdatePlayer } = await import('../../../lib/iplSrlAdminControl.mjs');
    const result = await adminUpdatePlayer(req.params.playerId, req.body || {}, req.admin?.id || 'admin');
    await jsonSnap(res, result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
