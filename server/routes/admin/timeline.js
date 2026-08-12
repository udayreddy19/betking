/**
 * Phase 5: Entity Timeline API Routes
 */
import { Router } from 'express';
import { logAdminAction } from '../../middleware/auditLogger.js';
const router = Router();
let pgQuery = null;
async function getQuery() { if (!pgQuery) { const m = await import('../../../db/pg.js'); pgQuery = m.query; } return pgQuery; }
function genId(p) { return `${p}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`; }

// GET /timeline/:entityType/:entityId — get entity timeline
router.get('/:entityType/:entityId', async (req, res) => {
  try {
    const q = await getQuery();
    const { entityType, entityId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const result = await q(
      `SELECT * FROM entity_timeline_events WHERE entity_type = $1 AND entity_id = $2 ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
      [entityType, entityId, parseInt(limit), offset]
    );
    const countRes = await q('SELECT COUNT(*) FROM entity_timeline_events WHERE entity_type = $1 AND entity_id = $2', [entityType, entityId]);
    res.json({ entityType, entityId, events: result.rows, total: parseInt(countRes.rows[0]?.count || 0) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /timeline — record a timeline event
router.post('/', async (req, res) => {
  try {
    const q = await getQuery();
    const { entityType, entityId, eventType, eventCategory, status, description, details, correlationId } = req.body;
    if (!entityType || !entityId || !eventType) return res.status(400).json({ error: 'entityType, entityId, and eventType are required' });
    const eventId = genId('evt');
    await q(
      `INSERT INTO entity_timeline_events (event_id, entity_type, entity_id, event_type, event_category, actor_id, actor_type, status, description, details, correlation_id, tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6,'admin',$7,$8,$9,$10,$11)`,
      [eventId, entityType, entityId, eventType, eventCategory||'ADMIN_ACTION', req.admin.id, status||null, description||null, JSON.stringify(details||{}), correlationId||req.correlationId, req.admin.tenant]
    );
    res.status(201).json({ eventId, entityType, entityId, eventType });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
