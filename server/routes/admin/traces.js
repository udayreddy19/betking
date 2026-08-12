/**
 * Phase 16: Correlation Tracing — uses outbox_events.correlation_id
 */
import { Router } from 'express';
import { requirePermission } from '../../middleware/adminAuth.js';
const router = Router();
let pgQuery = null;
async function getQuery() { if (!pgQuery) { const m = await import('../../../db/pg.js'); pgQuery = m.query; } return pgQuery; }

router.get('/:correlationId', requirePermission('operations', 'platform'), async (req, res) => {
  try {
    const q = await getQuery();
    const cid = req.params.correlationId;
    const [events, audits, timeline] = await Promise.all([
      q('SELECT * FROM outbox_events WHERE correlation_id = $1 ORDER BY created_at ASC', [cid]),
      q('SELECT * FROM audit_events WHERE details::text ILIKE $1 ORDER BY created_at ASC', [`%${cid}%`]),
      q('SELECT * FROM entity_timeline_events WHERE correlation_id = $1 ORDER BY created_at ASC', [cid]),
    ]);
    res.json({ correlationId: cid, outboxEvents: events.rows, auditEvents: audits.rows, timelineEvents: timeline.rows,
      totalSteps: events.rows.length + audits.rows.length + timeline.rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
