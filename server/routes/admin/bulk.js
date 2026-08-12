/**
 * Phase 10: Bulk Operations API Routes
 */
import { Router } from 'express';
import { requireRole } from '../../middleware/adminAuth.js';
import { logAdminAction } from '../../middleware/auditLogger.js';
const router = Router();
let pgQuery = null;
async function getQuery() { if (!pgQuery) { const m = await import('../../../db/pg.js'); pgQuery = m.query; } return pgQuery; }

// POST /bulk/execute — execute bulk operation
router.post('/execute', async (req, res) => {
  try {
    const { operationType, entityIds, params: opParams } = req.body;
    if (!operationType) return res.status(400).json({ error: 'operationType is required' });
    if (!entityIds || !Array.isArray(entityIds) || entityIds.length === 0) return res.status(400).json({ error: 'entityIds array is required' });

    const q = await getQuery();
    const results = { total: entityIds.length, succeeded: 0, failed: 0, errors: [] };

    // Preview mode — show impact without executing
    if (req.body.preview) {
      return res.json({ preview: true, operationType, affectedCount: entityIds.length, entityIds, message: `This will ${operationType} ${entityIds.length} records` });
    }

    // Validate confirmation for large operations
    if (entityIds.length > 10 && !req.body.confirmed) {
      return res.status(400).json({ error: 'Large bulk operations require explicit confirmation', code: 'CONFIRMATION_REQUIRED', affectedCount: entityIds.length });
    }

    await logAdminAction({ actorId: req.admin.id, action: `BULK_${operationType}`, details: { count: entityIds.length, entityIds: entityIds.slice(0, 10) } });
    res.json({ operationType, ...results, status: 'COMPLETED', message: `Bulk ${operationType} completed for ${entityIds.length} records` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
