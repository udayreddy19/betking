/**
 * Phase 20: Task Management API Routes
 */
import { Router } from 'express';
import { logAdminAction } from '../../middleware/auditLogger.js';
const router = Router();
let pgQuery = null;
async function getQuery() { if (!pgQuery) { const m = await import('../../../db/pg.js'); pgQuery = m.query; } return pgQuery; }
function genId(p) { return `${p}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`; }

async function ensureTable() {
  const q = await getQuery();
  await q(`CREATE TABLE IF NOT EXISTS operational_tasks (
    task_id VARCHAR(64) PRIMARY KEY, title VARCHAR(255) NOT NULL, description TEXT,
    owner_id VARCHAR(64), team VARCHAR(64), priority VARCHAR(16) DEFAULT 'MEDIUM',
    status VARCHAR(32) DEFAULT 'OPEN', sla_hours INT DEFAULT 24,
    related_entity_type VARCHAR(64), related_entity_id VARCHAR(128),
    source_type VARCHAR(64), source_id VARCHAR(128),
    due_date TIMESTAMP WITH TIME ZONE, completed_at TIMESTAMP WITH TIME ZONE,
    created_by VARCHAR(64) NOT NULL, tenant_id VARCHAR(64) DEFAULT 'betking_in',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  )`);
}

router.get('/', async (req, res) => {
  try { await ensureTable(); const q = await getQuery();
    const { status, ownerId, priority } = req.query;
    const conds = ['tenant_id = $1']; const params = [req.admin.tenant]; let i = 2;
    if (status) { conds.push(`status = $${i++}`); params.push(status); }
    if (ownerId) { conds.push(`owner_id = $${i++}`); params.push(ownerId); }
    if (priority) { conds.push(`priority = $${i++}`); params.push(priority); }
    const result = await q(`SELECT * FROM operational_tasks WHERE ${conds.join(' AND ')} ORDER BY created_at DESC LIMIT 100`, params);
    res.json({ tasks: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try { await ensureTable(); const q = await getQuery();
    const { title, description, ownerId, team, priority, slaHours, relatedEntityType, relatedEntityId, sourceType, sourceId, dueDate } = req.body;
    if (!title) return res.status(400).json({ error: 'Task title is required' });
    const id = genId('task');
    await q('INSERT INTO operational_tasks (task_id, title, description, owner_id, team, priority, sla_hours, related_entity_type, related_entity_id, source_type, source_id, due_date, created_by, tenant_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
      [id, title, description||null, ownerId||null, team||null, priority||'MEDIUM', slaHours||24, relatedEntityType||null, relatedEntityId||null, sourceType||null, sourceId||null, dueDate||null, req.admin.id, req.admin.tenant]);
    await logAdminAction({ actorId: req.admin.id, targetId: id, action: 'TASK_CREATED', details: { title } });
    res.status(201).json({ taskId: id, title, status: 'OPEN' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id/status', async (req, res) => {
  try { await ensureTable(); const q = await getQuery();
    const { status } = req.body;
    const validStatuses = ['OPEN','IN_PROGRESS','BLOCKED','COMPLETED','CANCELLED'];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: `Invalid status. Valid: ${validStatuses.join(', ')}` });
    const completedAt = status === 'COMPLETED' ? 'NOW()' : 'NULL';
    await q(`UPDATE operational_tasks SET status = $1, completed_at = ${status === 'COMPLETED' ? 'NOW()' : 'NULL'}, updated_at = NOW() WHERE task_id = $2`, [status, req.params.id]);
    await logAdminAction({ actorId: req.admin.id, targetId: req.params.id, action: 'TASK_STATUS_CHANGED', details: { status } });
    res.json({ taskId: req.params.id, status });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
