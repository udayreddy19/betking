/**
 * Phase 19: My Workspace — aggregates tickets, cases, approvals, tasks, alerts
 */
import { Router } from 'express';
const router = Router();
let pgQuery = null;
async function getQuery() { if (!pgQuery) { const m = await import('../../../db/pg.js'); pgQuery = m.query; } return pgQuery; }

router.get('/', async (req, res) => {
  try {
    const q = await getQuery();
    const adminId = req.admin.id;

    const [cases, approvals, tasks, notifications, recentAudit] = await Promise.all([
      q("SELECT case_id, case_type, priority, status, title, created_at FROM cases WHERE owner_id = $1 AND status NOT IN ('CLOSED') ORDER BY created_at DESC LIMIT 20", [adminId]).catch(() => ({ rows: [] })),
      q("SELECT * FROM maker_checker_requests WHERE status = 'PENDING_APPROVAL' AND maker_id != $1 ORDER BY created_at DESC LIMIT 20", [adminId]).catch(() => ({ rows: [] })),
      q("SELECT * FROM case_tasks WHERE assignee_id = $1 AND status NOT IN ('COMPLETED','CANCELLED') ORDER BY due_date ASC LIMIT 20", [adminId]).catch(() => ({ rows: [] })),
      q("SELECT * FROM admin_notifications WHERE admin_id = $1 AND is_read = FALSE ORDER BY created_at DESC LIMIT 10", [adminId]).catch(() => ({ rows: [] })),
      q("SELECT event_id, action, target_id, created_at FROM audit_events WHERE actor_id = $1 ORDER BY created_at DESC LIMIT 10", [adminId]).catch(() => ({ rows: [] })),
    ]);

    res.json({
      myCases: cases.rows,
      myApprovals: approvals.rows,
      myTasks: tasks.rows,
      myAlerts: notifications.rows,
      recentActivity: recentAudit.rows,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
