/**
 * Phase 11: Scheduled Operations API Routes
 */
import { Router } from 'express';
import { requireRole } from '../../middleware/adminAuth.js';
import { logAdminAction } from '../../middleware/auditLogger.js';
const router = Router();
let pgQuery = null;
async function getQuery() { if (!pgQuery) { const m = await import('../../../db/pg.js'); pgQuery = m.query; } return pgQuery; }
function genId(p) { return `${p}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`; }

// Scheduled operations are stored in a new table
// For now, create inline if table doesn't exist
async function ensureTable() {
  const q = await getQuery();
  await q(`CREATE TABLE IF NOT EXISTS scheduled_operations (
    schedule_id VARCHAR(64) PRIMARY KEY, action_type VARCHAR(128) NOT NULL, target_entity_type VARCHAR(64),
    target_entity_id VARCHAR(128), scheduled_time TIMESTAMP WITH TIME ZONE NOT NULL, timezone VARCHAR(64) DEFAULT 'Asia/Kolkata',
    status VARCHAR(32) DEFAULT 'SCHEDULED', created_by VARCHAR(64) NOT NULL, approved_by VARCHAR(64),
    execution_result JSONB, rollback_info JSONB, tenant_id VARCHAR(64) DEFAULT 'betking_in',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, executed_at TIMESTAMP WITH TIME ZONE
  )`);
}

router.get('/', async (req, res) => {
  try { await ensureTable(); const q = await getQuery();
    const result = await q("SELECT * FROM scheduled_operations WHERE tenant_id = $1 ORDER BY scheduled_time ASC", [req.admin.tenant]);
    res.json({ scheduled: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', requireRole('SUPER_ADMIN', 'OPERATIONS_ADMIN'), async (req, res) => {
  try { await ensureTable(); const q = await getQuery();
    const { actionType, targetEntityType, targetEntityId, scheduledTime, timezone } = req.body;
    if (!actionType || !scheduledTime) return res.status(400).json({ error: 'actionType and scheduledTime are required' });
    const id = genId('sched');
    await q('INSERT INTO scheduled_operations (schedule_id, action_type, target_entity_type, target_entity_id, scheduled_time, timezone, created_by, tenant_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [id, actionType, targetEntityType||null, targetEntityId||null, scheduledTime, timezone||'Asia/Kolkata', req.admin.id, req.admin.tenant]);
    await logAdminAction({ actorId: req.admin.id, targetId: id, action: 'SCHEDULED_OPERATION_CREATED', details: { actionType, scheduledTime } });
    res.status(201).json({ scheduleId: id, actionType, scheduledTime, status: 'SCHEDULED' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', requireRole('SUPER_ADMIN', 'OPERATIONS_ADMIN'), async (req, res) => {
  try { await ensureTable(); const q = await getQuery();
    await q("UPDATE scheduled_operations SET status = 'CANCELLED' WHERE schedule_id = $1", [req.params.id]);
    await logAdminAction({ actorId: req.admin.id, targetId: req.params.id, action: 'SCHEDULED_OPERATION_CANCELLED' });
    res.json({ scheduleId: req.params.id, status: 'CANCELLED' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
