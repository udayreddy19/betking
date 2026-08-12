/**
 * Phase 15: Event Debugger — uses existing outbox_events table
 */
import { Router } from 'express';
import { requirePermission } from '../../middleware/adminAuth.js';
const router = Router();
let pgQuery = null;
async function getQuery() { if (!pgQuery) { const m = await import('../../../db/pg.js'); pgQuery = m.query; } return pgQuery; }

router.get('/', requirePermission('operations', 'platform'), async (req, res) => {
  try {
    const q = await getQuery();
    const { status, eventType, page = 1, limit = 50 } = req.query;
    const conds = []; const params = []; let i = 1;
    if (status) { conds.push(`status = $${i++}`); params.push(status); }
    if (eventType) { conds.push(`event_type = $${i++}`); params.push(eventType); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const result = await q(`SELECT * FROM outbox_events ${where} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i++}`, [...params, parseInt(limit), offset]);
    res.json({ events: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', requirePermission('operations', 'platform'), async (req, res) => {
  try {
    const q = await getQuery();
    const result = await q('SELECT * FROM outbox_events WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Event not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
