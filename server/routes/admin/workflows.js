/**
 * Phase 3: Workflow / Approval Engine API Routes
 */
import { Router } from 'express';
import { requireRole } from '../../middleware/adminAuth.js';
import { logAdminAction } from '../../middleware/auditLogger.js';

const router = Router();

let pgQuery = null;
async function getQuery() {
  if (!pgQuery) { const mod = await import('../../../db/pg.js'); pgQuery = mod.query; }
  return pgQuery;
}

function generateId(prefix) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }

// Workflow templates define the steps for each type
const WORKFLOW_TEMPLATES = {
  WITHDRAWAL: [
    { name: 'Request Validation', type: 'VALIDATION', approverRole: null },
    { name: 'Risk Assessment', type: 'REVIEW', approverRole: 'RISK_ANALYST' },
    { name: 'Finance Approval', type: 'APPROVAL', approverRole: 'FINANCE_ADMIN' },
    { name: 'Payment Execution', type: 'EXECUTION', approverRole: null },
  ],
  LARGE_BET: [
    { name: 'Risk Review', type: 'REVIEW', approverRole: 'RISK_ANALYST' },
    { name: 'Trading Review', type: 'REVIEW', approverRole: 'TRADING_ADMIN' },
    { name: 'Approve / Reject', type: 'APPROVAL', approverRole: 'TRADING_ADMIN' },
  ],
  SETTLEMENT_CORRECTION: [
    { name: 'Correction Request', type: 'VALIDATION', approverRole: null },
    { name: 'Review', type: 'REVIEW', approverRole: 'TRADING_ADMIN' },
    { name: 'Approval', type: 'APPROVAL', approverRole: 'FINANCE_ADMIN' },
    { name: 'Apply Correction', type: 'EXECUTION', approverRole: null },
    { name: 'Reconciliation', type: 'RECONCILIATION', approverRole: null },
  ],
  CONFIG_CHANGE: [
    { name: 'Change Request', type: 'VALIDATION', approverRole: null },
    { name: 'Review', type: 'REVIEW', approverRole: 'OPERATIONS_ADMIN' },
    { name: 'Approval', type: 'APPROVAL', approverRole: 'SUPER_ADMIN' },
    { name: 'Apply', type: 'EXECUTION', approverRole: null },
  ],
};

// POST /api/admin/v2/workflows — create workflow
router.post('/', async (req, res) => {
  try {
    const { workflowType, targetEntityType, targetEntityId, requestPayload, timeoutHours } = req.body;
    if (!workflowType || !WORKFLOW_TEMPLATES[workflowType]) {
      return res.status(400).json({ error: `Invalid workflow type. Valid: ${Object.keys(WORKFLOW_TEMPLATES).join(', ')}` });
    }

    const query = await getQuery();
    const workflowId = generateId('wf');
    const template = WORKFLOW_TEMPLATES[workflowType];
    const expiresAt = new Date(Date.now() + (timeoutHours || 24) * 60 * 60 * 1000).toISOString();

    await query(
      `INSERT INTO workflows (workflow_id, workflow_type, status, target_entity_type, target_entity_id, request_payload, created_by, total_steps, timeout_hours, expires_at, tenant_id)
       VALUES ($1, $2, 'PENDING', $3, $4, $5, $6, $7, $8, $9, $10)`,
      [workflowId, workflowType, targetEntityType || null, targetEntityId || null, JSON.stringify(requestPayload || {}), req.admin.id, template.length, timeoutHours || 24, expiresAt, req.admin.tenant]
    );

    // Create steps
    for (let i = 0; i < template.length; i++) {
      const step = template[i];
      const stepId = generateId('wfs');
      await query(
        `INSERT INTO workflow_steps (step_id, workflow_id, step_order, step_name, step_type, approver_role, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [stepId, workflowId, i + 1, step.name, step.type, step.approverRole, i === 0 ? 'IN_PROGRESS' : 'PENDING']
      );
    }

    await logAdminAction({ actorId: req.admin.id, targetId: workflowId, action: 'WORKFLOW_CREATED', details: { workflowType, targetEntityType, targetEntityId } });
    res.status(201).json({ workflowId, workflowType, status: 'PENDING', totalSteps: template.length, expiresAt });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create workflow', message: err.message });
  }
});

// GET /api/admin/v2/workflows — list workflows
router.get('/', async (req, res) => {
  try {
    const query = await getQuery();
    const { status, workflowType, page = 1, limit = 25 } = req.query;
    const conditions = ['tenant_id = $1'];
    const params = [req.admin.tenant];
    let idx = 2;
    if (status) { conditions.push(`status = $${idx++}`); params.push(status); }
    if (workflowType) { conditions.push(`workflow_type = $${idx++}`); params.push(workflowType); }
    const offset = (parseInt(page) - 1) * parseInt(limit);
    params.push(parseInt(limit), offset);
    const result = await query(
      `SELECT * FROM workflows WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`, params
    );
    const countRes = await query(`SELECT COUNT(*) FROM workflows WHERE ${conditions.slice(0, -0).join(' AND ')}`, params.slice(0, idx - 3));
    res.json({ workflows: result.rows, total: parseInt(countRes.rows[0]?.count || 0) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list workflows', message: err.message });
  }
});

// GET /api/admin/v2/workflows/:id — get workflow detail with steps
router.get('/:id', async (req, res) => {
  try {
    const query = await getQuery();
    const wf = await query('SELECT * FROM workflows WHERE workflow_id = $1', [req.params.id]);
    if (wf.rows.length === 0) return res.status(404).json({ error: 'Workflow not found' });
    const steps = await query('SELECT * FROM workflow_steps WHERE workflow_id = $1 ORDER BY step_order', [req.params.id]);
    res.json({ ...wf.rows[0], steps: steps.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get workflow', message: err.message });
  }
});

// POST /api/admin/v2/workflows/:id/steps/:stepId/approve — approve step
router.post('/:id/steps/:stepId/approve', async (req, res) => {
  try {
    const query = await getQuery();
    const step = await query('SELECT * FROM workflow_steps WHERE step_id = $1 AND workflow_id = $2', [req.params.stepId, req.params.id]);
    if (step.rows.length === 0) return res.status(404).json({ error: 'Step not found' });

    const stepData = step.rows[0];
    if (stepData.status !== 'IN_PROGRESS' && stepData.status !== 'PENDING') {
      return res.status(400).json({ error: `Step is already ${stepData.status}` });
    }

    // Maker-checker: creator cannot approve
    const wf = await query('SELECT created_by FROM workflows WHERE workflow_id = $1', [req.params.id]);
    if (wf.rows[0]?.created_by === req.admin.id) {
      return res.status(403).json({ error: 'MAKER_CHECKER: The creator of a workflow cannot approve their own request', code: 'SELF_APPROVAL_PROHIBITED' });
    }

    // Role check
    if (stepData.approver_role && req.admin.role !== stepData.approver_role && req.admin.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: `This step requires role: ${stepData.approver_role}`, code: 'ROLE_REQUIRED' });
    }

    await query("UPDATE workflow_steps SET status = 'APPROVED', actor_id = $1, actor_reason = $2, completed_at = NOW() WHERE step_id = $3",
      [req.admin.id, req.body.reason || null, req.params.stepId]);

    // Advance to next step
    const nextStep = await query("SELECT step_id FROM workflow_steps WHERE workflow_id = $1 AND step_order = $2", [req.params.id, stepData.step_order + 1]);
    if (nextStep.rows.length > 0) {
      await query("UPDATE workflow_steps SET status = 'IN_PROGRESS', started_at = NOW() WHERE step_id = $1", [nextStep.rows[0].step_id]);
      await query("UPDATE workflows SET current_step = $1, status = 'IN_REVIEW', updated_at = NOW() WHERE workflow_id = $2", [stepData.step_order + 1, req.params.id]);
    } else {
      await query("UPDATE workflows SET status = 'COMPLETED', completed_at = NOW(), updated_at = NOW() WHERE workflow_id = $1", [req.params.id]);
    }

    await logAdminAction({ actorId: req.admin.id, targetId: req.params.id, action: 'WORKFLOW_STEP_APPROVED', details: { stepId: req.params.stepId, stepName: stepData.step_name } });
    res.json({ success: true, stepId: req.params.stepId, status: 'APPROVED' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to approve step', message: err.message });
  }
});

// POST /api/admin/v2/workflows/:id/steps/:stepId/reject — reject step
router.post('/:id/steps/:stepId/reject', async (req, res) => {
  try {
    const query = await getQuery();
    if (!req.body.reason) return res.status(400).json({ error: 'Rejection reason is required' });

    const wf = await query('SELECT created_by FROM workflows WHERE workflow_id = $1', [req.params.id]);
    if (wf.rows[0]?.created_by === req.admin.id) {
      return res.status(403).json({ error: 'MAKER_CHECKER: The creator cannot reject their own request', code: 'SELF_APPROVAL_PROHIBITED' });
    }

    await query("UPDATE workflow_steps SET status = 'REJECTED', actor_id = $1, actor_reason = $2, completed_at = NOW() WHERE step_id = $3",
      [req.admin.id, req.body.reason, req.params.stepId]);
    await query("UPDATE workflows SET status = 'REJECTED', updated_at = NOW() WHERE workflow_id = $1", [req.params.id]);

    await logAdminAction({ actorId: req.admin.id, targetId: req.params.id, action: 'WORKFLOW_STEP_REJECTED', details: { stepId: req.params.stepId, reason: req.body.reason } });
    res.json({ success: true, stepId: req.params.stepId, status: 'REJECTED' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reject step', message: err.message });
  }
});

// GET /api/admin/v2/workflows/pending — my pending approvals
router.get('/pending/mine', async (req, res) => {
  try {
    const query = await getQuery();
    const result = await query(
      `SELECT ws.*, w.workflow_type, w.created_by, w.request_payload, w.target_entity_type, w.target_entity_id
       FROM workflow_steps ws
       JOIN workflows w ON ws.workflow_id = w.workflow_id
       WHERE ws.status IN ('PENDING', 'IN_PROGRESS')
         AND (ws.approver_role = $1 OR ws.approver_role IS NULL OR $1 = 'SUPER_ADMIN')
         AND w.created_by != $2
         AND w.tenant_id = $3
       ORDER BY w.created_at ASC`,
      [req.admin.role, req.admin.id, req.admin.tenant]
    );
    res.json({ pendingApprovals: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pending approvals', message: err.message });
  }
});

export default router;
