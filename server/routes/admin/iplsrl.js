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
    await jsonSnap(res, await declareIPLSRLWinner(
      req.params.matchId,
      req.body.teamId,
      req.admin?.id || 'admin',
      req.admin?.role || 'SUPER_ADMIN',
      { note: req.body?.note || null },
    ));
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
      role: req.admin?.role || 'SUPER_ADMIN',
      note: req.body?.note || null,
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

// ---------------------------------------------------------------------------
// Advanced Match Control API Extensions
// ---------------------------------------------------------------------------

router.post('/matches/:matchId/incident', iplsrlRoles, async (req, res) => {
  try {
    const { injectIPLSRLIncident } = await import('../../../lib/iplSrlAdminControl.mjs');
    const result = injectIPLSRLIncident(req.params.matchId, req.body || {}, req.admin?.id || 'admin');
    await jsonSnap(res, result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/matches/:matchId/target', iplsrlRoles, async (req, res) => {
  try {
    const { pinpointIPLSRLTarget } = await import('../../../lib/iplSrlAdminControl.mjs');
    const result = pinpointIPLSRLTarget(req.params.matchId, req.body?.target, req.admin?.id || 'admin');
    await jsonSnap(res, result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/matches/:matchId/tie-game', iplsrlRoles, async (req, res) => {
  try {
    const { triggerIPLSRLTieGame } = await import('../../../lib/iplSrlAdminControl.mjs');
    const result = triggerIPLSRLTieGame(req.params.matchId, req.admin?.id || 'admin');
    await jsonSnap(res, result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/matches/:matchId/rain-delay', iplsrlRoles, async (req, res) => {
  try {
    const { toggleIPLSRLRainDelay } = await import('../../../lib/iplSrlAdminControl.mjs');
    const result = toggleIPLSRLRainDelay(req.params.matchId, req.body?.isDelayed !== false, req.admin?.id || 'admin');
    await jsonSnap(res, result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/matches/:matchId/reduce-overs', iplsrlRoles, async (req, res) => {
  try {
    const { reduceIPLSRLOvers } = await import('../../../lib/iplSrlAdminControl.mjs');
    const result = reduceIPLSRLOvers(req.params.matchId, req.body?.overs, req.admin?.id || 'admin');
    await jsonSnap(res, result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/matches/:matchId/margin', iplsrlRoles, async (req, res) => {
  try {
    const { setIPLSRLMarginDefense } = await import('../../../lib/iplSrlAdminControl.mjs');
    const result = setIPLSRLMarginDefense(req.params.matchId, req.body || {}, req.admin?.id || 'admin');
    await jsonSnap(res, result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/matches/:matchId/commentary', iplsrlRoles, async (req, res) => {
  try {
    const { broadcastIPLSRLCommentary } = await import('../../../lib/iplSrlAdminControl.mjs');
    const result = broadcastIPLSRLCommentary(req.params.matchId, req.body || {}, req.admin?.id || 'admin');
    await jsonSnap(res, result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/matches/:matchId/bulk-settle', iplsrlRoles, async (req, res) => {
  try {
    const { bulkSettleIPLSRLMarkets } = await import('../../../lib/iplSrlAdminControl.mjs');
    const result = await bulkSettleIPLSRLMarkets(req.params.matchId, req.body?.phase || 'toss', req.admin?.id || 'admin');
    await jsonSnap(res, result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/matches/custom', iplsrlRoles, async (req, res) => {
  try {
    const { createIPLSRLCustomMatch } = await import('../../../lib/iplSrlAdminControl.mjs');
    const result = createIPLSRLCustomMatch(req.body || {}, req.admin?.id || 'admin');
    await jsonSnap(res, result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/blueprints', iplsrlRoles, async (req, res) => {
  try {
    const { OVER_BLUEPRINT_PRESETS } = await import('../../../lib/iplSrlOperatorState.mjs');
    res.json({ presets: OVER_BLUEPRINT_PRESETS });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/matches/:matchId/script-over', iplsrlRoles, async (req, res) => {
  try {
    const { scriptIPLSRLOver } = await import('../../../lib/iplSrlAdminControl.mjs');
    const result = scriptIPLSRLOver(req.params.matchId, req.body || {}, req.admin?.id || 'admin');
    await jsonSnap(res, result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/matches/:matchId/profit-maximizer', iplsrlRoles, async (req, res) => {
  try {
    const { toggleIPLSRLProfitMaximizer } = await import('../../../lib/iplSrlAdminControl.mjs');
    const result = toggleIPLSRLProfitMaximizer(req.params.matchId, req.body || {}, req.admin?.id || 'admin');
    await jsonSnap(res, result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/matches/:matchId/toss', iplsrlRoles, async (req, res) => {
  try {
    const { executeIPLSRLToss } = await import('../../../lib/iplSrlAdminControl.mjs');
    const result = executeIPLSRLToss(req.params.matchId, req.body || {}, req.admin?.id || 'admin');
    await jsonSnap(res, result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/matches/:matchId/lineup', iplsrlRoles, async (req, res) => {
  try {
    const { updateIPLSRLLineup } = await import('../../../lib/iplSrlAdminControl.mjs');
    const result = updateIPLSRLLineup(req.params.matchId, req.body || {}, req.admin?.id || 'admin');
    await jsonSnap(res, result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/matches/:matchId/replay', iplsrlRoles, async (req, res) => {
  try {
    const { getIPLSRLMatchReplay } = await import('../../../lib/iplSrlAdminControl.mjs');
    const result = getIPLSRLMatchReplay(req.params.matchId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/matches/:matchId/export', iplsrlRoles, async (req, res) => {
  try {
    const { exportIPLSRLMatchAudit } = await import('../../../lib/iplSrlAdminControl.mjs');
    const result = exportIPLSRLMatchAudit(req.params.matchId);
    if (req.query?.format === 'csv') {
      const deliveries = result.deliveries || [];
      const headers = [
        'overNumber', 'ballInOver', 'innings', 'bowler', 'batsman', 'outcome', 'runs',
        'wicket', 'wicketType', 'boardBeforeRuns', 'boardAfterRuns', 'boardAfterWickets',
        'commentary', 'admin', 'timestamp',
      ];
      const csvRows = [headers.join(',')];
      for (const d of deliveries) {
        csvRows.push([
          d.overNumber,
          d.ballInOver,
          d.innings,
          `"${(d.bowler || '').replace(/"/g, '""')}"`,
          `"${(d.batsman || '').replace(/"/g, '""')}"`,
          d.outcome,
          d.runs,
          d.wicket ? 1 : 0,
          `"${(d.wicketType || '').replace(/"/g, '""')}"`,
          d.boardBefore?.runs ?? '',
          d.boardAfter?.runs ?? d.score?.runs ?? '',
          d.boardAfter?.wickets ?? d.score?.wickets ?? '',
          `"${(d.commentary || '').replace(/"/g, '""')}"`,
          `"${(d.admin || '').replace(/"/g, '""')}"`,
          d.timestamp,
        ].join(','));
      }
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="srl_${req.params.matchId}_audit.csv"`);
      return res.send(csvRows.join('\n'));
    }
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/matches/:matchId/what-if', iplsrlRoles, async (req, res) => {
  try {
    const { simulateSrlWhatIf } = await import('../../../lib/iplSrlAdminControl.mjs');
    const result = simulateSrlWhatIf(req.params.matchId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/matches/:matchId/what-if/execute', iplsrlRoles, async (req, res) => {
  try {
    const { executeSrlWhatIf } = await import('../../../lib/iplSrlAdminControl.mjs');
    const result = executeSrlWhatIf(req.params.matchId, req.body || {}, req.admin?.id || 'admin');
    await jsonSnap(res, result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/matches/:matchId/clear-queue', iplsrlRoles, async (req, res) => {
  try {
    const { clearIPLSRLIncidentQueue } = await import('../../../lib/iplSrlAdminControl.mjs');
    const result = clearIPLSRLIncidentQueue(req.params.matchId, req.admin?.id || 'admin');
    await jsonSnap(res, result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/matches/:matchId/undo-inject', iplsrlRoles, async (req, res) => {
  try {
    const { undoIPLSRLLastInject } = await import('../../../lib/iplSrlAdminControl.mjs');
    const result = undoIPLSRLLastInject(
      req.params.matchId,
      req.admin?.id || 'admin',
      { count: req.body?.count || 1 },
    );
    await jsonSnap(res, result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/matches/:matchId/anchors', iplsrlRoles, async (req, res) => {
  try {
    const { clearIPLSRLScoreAnchors } = await import('../../../lib/iplSrlAdminControl.mjs');
    const result = clearIPLSRLScoreAnchors(
      req.params.matchId,
      req.admin?.id || 'admin',
      req.admin?.role || 'SUPER_ADMIN',
      { note: req.body?.note || req.query?.note || null },
    );
    await jsonSnap(res, result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/matches/:matchId/inject-history', iplsrlRoles, async (req, res) => {
  try {
    const { getIPLSRLInjectHistory } = await import('../../../lib/iplSrlAdminControl.mjs');
    res.json(getIPLSRLInjectHistory(req.params.matchId, { limit: req.query?.limit || 40 }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/matches/:matchId/public-preview', iplsrlRoles, async (req, res) => {
  try {
    const { getIPLSRLPublicPreview } = await import('../../../lib/iplSrlAdminControl.mjs');
    res.json(getIPLSRLPublicPreview(req.params.matchId));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/matches/:matchId/settlement-wizard', iplsrlRoles, async (req, res) => {
  try {
    const { runIPLSRLSettlementWizard } = await import('../../../lib/iplSrlAdminControl.mjs');
    const result = await runIPLSRLSettlementWizard(
      req.params.matchId,
      req.body || {},
      req.admin?.id || 'admin',
      req.admin?.role || 'SUPER_ADMIN',
    );
    await jsonSnap(res, result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/desk/heartbeat', iplsrlRoles, async (req, res) => {
  try {
    const { heartbeatIPLSRLDeskPresence } = await import('../../../lib/iplSrlAdminControl.mjs');
    const presence = heartbeatIPLSRLDeskPresence({
      adminId: req.admin?.id || 'admin',
      role: req.admin?.role || 'SUPER_ADMIN',
      matchId: req.body?.matchId || null,
      note: req.body?.note || null,
    });
    res.json({ success: true, presence });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/desk/shift-notes', iplsrlRoles, async (req, res) => {
  try {
    const { listIPLSRLShiftNotes } = await import('../../../lib/iplSrlAdminControl.mjs');
    res.json({ notes: listIPLSRLShiftNotes() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/desk/shift-notes', iplsrlRoles, async (req, res) => {
  try {
    const { addIPLSRLShiftNote } = await import('../../../lib/iplSrlAdminControl.mjs');
    const note = addIPLSRLShiftNote({
      admin: req.admin?.id || 'admin',
      text: req.body?.text || req.body?.note,
    });
    res.json({ success: true, note });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/script-presets', iplsrlRoles, async (req, res) => {
  try {
    const { listIPLSRLScriptPresets } = await import('../../../lib/iplSrlAdminControl.mjs');
    res.json(listIPLSRLScriptPresets());
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/script-presets', iplsrlRoles, async (req, res) => {
  try {
    const { saveIPLSRLScriptPreset } = await import('../../../lib/iplSrlAdminControl.mjs');
    res.json(saveIPLSRLScriptPreset(req.body || {}, req.admin?.id || 'admin'));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/script-presets/:presetId', iplsrlRoles, async (req, res) => {
  try {
    const { deleteIPLSRLScriptPreset } = await import('../../../lib/iplSrlAdminControl.mjs');
    res.json(deleteIPLSRLScriptPreset(req.params.presetId, req.admin?.id || 'admin'));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/desk-capabilities', iplsrlRoles, async (req, res) => {
  try {
    const { getIPLSRLDeskCapabilitiesForRole } = await import('../../../lib/iplSrlAdminControl.mjs');
    res.json(getIPLSRLDeskCapabilitiesForRole(req.admin?.role || 'SUPER_ADMIN'));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/matches/:matchId/drift', iplsrlRoles, async (req, res) => {
  try {
    const { getIPLSRLScoreDrift } = await import('../../../lib/iplSrlAdminControl.mjs');
    res.json(getIPLSRLScoreDrift(req.params.matchId));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/matches/:matchId/queue-rehearsal', iplsrlRoles, async (req, res) => {
  try {
    const { rehearseIPLSRLQueue } = await import('../../../lib/iplSrlAdminControl.mjs');
    res.json(rehearseIPLSRLQueue(req.params.matchId));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/matches/:matchId/integrity-hold', iplsrlRoles, async (req, res) => {
  try {
    const { engageIPLSRLIntegrityHold } = await import('../../../lib/iplSrlAdminControl.mjs');
    const result = engageIPLSRLIntegrityHold(
      req.params.matchId,
      req.body || {},
      req.admin?.id || 'admin',
      req.admin?.role || 'SUPER_ADMIN',
    );
    await jsonSnap(res, result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/matches/:matchId/post-match-report', iplsrlRoles, async (req, res) => {
  try {
    const { getIPLSRLPostMatchReport } = await import('../../../lib/iplSrlAdminControl.mjs');
    res.json(getIPLSRLPostMatchReport(req.params.matchId));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/match-templates', iplsrlRoles, async (req, res) => {
  try {
    const { listIPLSRLMatchTemplates } = await import('../../../lib/iplSrlAdminControl.mjs');
    res.json(listIPLSRLMatchTemplates());
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/match-templates', iplsrlRoles, async (req, res) => {
  try {
    const { saveIPLSRLMatchTemplate, captureIPLSRLMatchTemplateFromMatch } = await import('../../../lib/iplSrlAdminControl.mjs');
    if (req.body?.fromMatchId) {
      return res.json(captureIPLSRLMatchTemplateFromMatch(
        req.body.fromMatchId,
        { name: req.body?.name },
        req.admin?.id || 'admin',
      ));
    }
    res.json(saveIPLSRLMatchTemplate(req.body || {}, req.admin?.id || 'admin'));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/match-templates/:templateId', iplsrlRoles, async (req, res) => {
  try {
    const { deleteIPLSRLMatchTemplate } = await import('../../../lib/iplSrlAdminControl.mjs');
    res.json(deleteIPLSRLMatchTemplate(req.params.templateId, req.admin?.id || 'admin'));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/matches/:matchId/apply-template', iplsrlRoles, async (req, res) => {
  try {
    const { applyIPLSRLMatchTemplate } = await import('../../../lib/iplSrlAdminControl.mjs');
    if (!req.body?.templateId) return res.status(400).json({ error: 'templateId required' });
    const result = applyIPLSRLMatchTemplate(
      req.params.matchId,
      req.body.templateId,
      req.admin?.id || 'admin',
    );
    await jsonSnap(res, result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/matches/:matchId/wagers', iplsrlRoles, async (req, res) => {
  try {
    const { getSrlLiveWagerTape } = await import('../../../lib/iplSrlAdminControl.mjs');
    const result = await getSrlLiveWagerTape(req.params.matchId, { limit: req.query?.limit || 20 });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/matches/:matchId/director-mode', iplsrlRoles, async (req, res) => {
  try {
    const { setIPLSRLDirectorMode } = await import('../../../lib/iplSrlAdminControl.mjs');
    const result = setIPLSRLDirectorMode(req.params.matchId, req.body?.mode, req.admin?.id || 'admin');
    await jsonSnap(res, result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/matches/:matchId/player-buff', iplsrlRoles, async (req, res) => {
  try {
    const { setIPLSRLPlayerBuff } = await import('../../../lib/iplSrlAdminControl.mjs');
    const result = setIPLSRLPlayerBuff(req.params.matchId, req.body || {}, req.admin?.id || 'admin');
    await jsonSnap(res, result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/matches/:matchId/environment', iplsrlRoles, async (req, res) => {
  try {
    const { setIPLSRLEnvironment } = await import('../../../lib/iplSrlAdminControl.mjs');
    const result = setIPLSRLEnvironment(req.params.matchId, req.body || {}, req.admin?.id || 'admin');
    await jsonSnap(res, result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/matches/:matchId/micro-markets', iplsrlRoles, async (req, res) => {
  try {
    const { getIPLSRLMicroMarkets } = await import('../../../lib/iplSrlAdminControl.mjs');
    const result = getIPLSRLMicroMarkets(req.params.matchId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/matches/:matchId/micro-markets/toggle', iplsrlRoles, async (req, res) => {
  try {
    const { setIPLSRLMicroMarketStatus } = await import('../../../lib/iplSrlAdminControl.mjs');
    const result = setIPLSRLMicroMarketStatus(req.params.matchId, req.body || {}, req.admin?.id || 'admin');
    await jsonSnap(res, result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/matches/:matchId/micro-markets/margin', iplsrlRoles, async (req, res) => {
  try {
    const { setIPLSRLMicroMarketMargin } = await import('../../../lib/iplSrlAdminControl.mjs');
    const result = setIPLSRLMicroMarketMargin(req.params.matchId, req.body || {}, req.admin?.id || 'admin');
    await jsonSnap(res, result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/matches/:matchId/micro-markets/mass-suspend', iplsrlRoles, async (req, res) => {
  try {
    const { setIPLSRLMicroMarketsMassSuspend } = await import('../../../lib/iplSrlAdminControl.mjs');
    const result = setIPLSRLMicroMarketsMassSuspend(
      req.params.matchId,
      !!req.body?.suspend,
      req.admin?.id || 'admin',
      req.admin?.role || 'SUPER_ADMIN',
    );
    await jsonSnap(res, result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/matches/:matchId/cashout', iplsrlRoles, async (req, res) => {
  try {
    const { getIPLSRLCashout } = await import('../../../lib/iplSrlAdminControl.mjs');
    const result = await getIPLSRLCashout(req.params.matchId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/matches/:matchId/cashout/config', iplsrlRoles, async (req, res) => {
  try {
    const { setIPLSRLCashoutConfig } = await import('../../../lib/iplSrlAdminControl.mjs');
    const result = setIPLSRLCashoutConfig(req.params.matchId, req.body || {}, req.admin?.id || 'admin');
    await jsonSnap(res, result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/matches/:matchId/cashout/sweetener', iplsrlRoles, async (req, res) => {
  try {
    const { pushIPLSRLCashoutSweetener } = await import('../../../lib/iplSrlAdminControl.mjs');
    const result = pushIPLSRLCashoutSweetener(req.params.matchId, req.body || {}, req.admin?.id || 'admin');
    await jsonSnap(res, result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/matches/:matchId/circuit-breaker', iplsrlRoles, async (req, res) => {
  try {
    const { getIPLSRLCircuitBreaker } = await import('../../../lib/iplSrlAdminControl.mjs');
    const result = getIPLSRLCircuitBreaker(req.params.matchId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/matches/:matchId/circuit-breaker/config', iplsrlRoles, async (req, res) => {
  try {
    const { setIPLSRLCircuitBreakerConfig } = await import('../../../lib/iplSrlAdminControl.mjs');
    const result = setIPLSRLCircuitBreakerConfig(req.params.matchId, req.body || {}, req.admin?.id || 'admin');
    await jsonSnap(res, result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/matches/:matchId/circuit-breaker/kill-switch', iplsrlRoles, async (req, res) => {
  try {
    const { toggleIPLSRLEmergencyKillSwitch } = await import('../../../lib/iplSrlAdminControl.mjs');
    const result = toggleIPLSRLEmergencyKillSwitch(
      req.params.matchId,
      req.body?.active,
      req.admin?.id || 'admin',
      req.admin?.role || 'SUPER_ADMIN',
      { note: req.body?.note || null },
    );
    await jsonSnap(res, result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/matches/:matchId/tactical-radar', iplsrlRoles, async (req, res) => {
  try {
    const { getIPLSRLTacticalRadar } = await import('../../../lib/iplSrlAdminControl.mjs');
    const result = getIPLSRLTacticalRadar(req.params.matchId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;

