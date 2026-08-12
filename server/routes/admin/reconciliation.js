/**
 * Phase 6: Reconciliation Center API Routes
 * Uses existing reconciliation_cases table from migration 004
 */
import { Router } from 'express';
import { requirePermission } from '../../middleware/adminAuth.js';
import { logAdminAction } from '../../middleware/auditLogger.js';
const router = Router();
let pgQuery = null;
async function getQuery() { if (!pgQuery) { const m = await import('../../../db/pg.js'); pgQuery = m.query; } return pgQuery; }

// GET /reconciliation/exceptions — list reconciliation exceptions
router.get('/exceptions', requirePermission('finance', 'reconciliation'), async (req, res) => {
  try {
    const q = await getQuery();
    const { status, severity, type, page = 1, limit = 25 } = req.query;
    const conds = []; const params = []; let i = 1;
    if (status) { conds.push(`status = $${i++}`); params.push(status); }
    if (severity) { conds.push(`severity = $${i++}`); params.push(severity); }
    if (type) { conds.push(`reconciliation_type = $${i++}`); params.push(type); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const result = await q(`SELECT * FROM reconciliation_cases ${where} ORDER BY detected_at DESC LIMIT $${i++} OFFSET $${i++}`, [...params, parseInt(limit), offset]);
    const countRes = await q(`SELECT COUNT(*) FROM reconciliation_cases ${where}`, params);
    res.json({ exceptions: result.rows, total: parseInt(countRes.rows[0]?.count || 0) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /reconciliation/run — trigger reconciliation audit
router.post('/run', requirePermission('finance', 'reconciliation'), async (req, res) => {
  try {
    const { runFullReconciliationAudit } = await import('../../../lib/reconciliationEngine.mjs');
    const result = await runFullReconciliationAudit();
    await logAdminAction({ actorId: req.admin.id, action: 'RECONCILIATION_AUDIT_RUN', details: { result: result.overallStatus, casesCreated: result.totalNewCasesCreated } });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /reconciliation/exceptions/:id/investigate
router.put('/exceptions/:id/investigate', requirePermission('finance', 'reconciliation'), async (req, res) => {
  try {
    const q = await getQuery();
    await q("UPDATE reconciliation_cases SET status = 'INVESTIGATING', assigned_to = $1 WHERE id = $2", [req.admin.id, req.params.id]);
    await logAdminAction({ actorId: req.admin.id, targetId: req.params.id, action: 'RECON_INVESTIGATE' });
    res.json({ id: req.params.id, status: 'INVESTIGATING' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /reconciliation/exceptions/:id/resolve
router.put('/exceptions/:id/resolve', requirePermission('finance', 'reconciliation'), async (req, res) => {
  try {
    const q = await getQuery();
    if (!req.body.resolution) return res.status(400).json({ error: 'Resolution is required' });
    await q("UPDATE reconciliation_cases SET status = 'RESOLVED', resolution = $1, resolved_at = NOW() WHERE id = $2", [req.body.resolution, req.params.id]);
    await logAdminAction({ actorId: req.admin.id, targetId: req.params.id, action: 'RECON_RESOLVED', details: { resolution: req.body.resolution } });
    res.json({ id: req.params.id, status: 'RESOLVED' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
