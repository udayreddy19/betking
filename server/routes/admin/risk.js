import { Router } from 'express';
import { requirePermission } from '../../middleware/adminAuth.js';
import { query } from '../../../db/pg.js';
import { globalLiabilityTracker, globalSyndicateDetector, setUserRiskProfile, getUserRiskSummary } from '../../../lib/riskEngine.mjs';

const router = Router();

// GET /api/admin/risk/signals — Admin risk signals list
router.get('/signals', requirePermission('security', 'risk', 'fraud'), async (req, res) => {
  const { userId, severity, signalType, status = 'NEW', page = 1, limit = 25 } = req.query;
  try {
    const conds = [];
    const params = [];
    let i = 1;

    if (userId) { conds.push(`user_id = $${i++}`); params.push(userId); }
    if (severity) { conds.push(`severity = $${i++}`); params.push(severity); }
    if (signalType) { conds.push(`signal_type = $${i++}`); params.push(signalType); }
    if (status) { conds.push(`status = $${i++}`); params.push(status); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const result = await query(
      `SELECT * FROM risk_signals ${where} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i++}`,
      [...params, parseInt(limit), offset]
    );

    const countRes = await query(`SELECT COUNT(*) FROM risk_signals ${where}`, params);

    res.json({
      signals: result.rows,
      total: parseInt(countRes.rows[0]?.count || 0),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/risk/liability/:matchId — Real-time match liability summary
router.get('/liability/:matchId?', requirePermission('trading', 'risk', 'finance'), (req, res) => {
  try {
    const matchId = req.params.matchId || req.query.matchId || 'global';
    const report = globalLiabilityTracker.getLiabilityReport(matchId);
    res.json({ success: true, report });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/risk/syndicates — Active syndicate & coordinated betting flags
router.get('/syndicates', requirePermission('risk', 'fraud', 'security'), (req, res) => {
  try {
    const flags = globalSyndicateDetector.getRecentFlags();
    res.json({ success: true, syndicates: flags });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/risk/user-tier — Update user risk tier (VIP, SHARP, RESTRICTED, STANDARD)
router.post('/user-tier', requirePermission('risk', 'fraud'), (req, res) => {
  try {
    const { userId, tier } = req.body || {};
    if (!userId || !tier) {
      return res.status(400).json({ error: 'userId and tier are required' });
    }
    const updated = setUserRiskProfile(userId, { tier: String(tier).toUpperCase() });
    res.json({ success: true, profile: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/risk/user-profile/:userId — Get risk profile summary for user
router.get('/user-profile/:userId', requirePermission('risk', 'fraud', 'support'), (req, res) => {
  try {
    const summary = getUserRiskSummary(req.params.userId);
    res.json({ success: true, ...summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

