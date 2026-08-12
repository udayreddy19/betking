/**
 * Phase 4: Business Rule Engine API Routes
 */
import { Router } from 'express';
import { requireRole } from '../../middleware/adminAuth.js';
import { logAdminAction } from '../../middleware/auditLogger.js';

const router = Router();
let pgQuery = null;
async function getQuery() { if (!pgQuery) { const m = await import('../../../db/pg.js'); pgQuery = m.query; } return pgQuery; }
function genId(p) { return `${p}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`; }

// GET /rules — list business rules
router.get('/', async (req, res) => {
  try {
    const q = await getQuery();
    const { status, category, page = 1, limit = 25 } = req.query;
    const conds = ['tenant_id = $1']; const params = [req.admin.tenant]; let i = 2;
    if (status) { conds.push(`status = $${i++}`); params.push(status); }
    if (category) { conds.push(`category = $${i++}`); params.push(category); }
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const result = await q(`SELECT * FROM business_rules WHERE ${conds.join(' AND ')} ORDER BY priority ASC, created_at DESC LIMIT $${i++} OFFSET $${i++}`, [...params, parseInt(limit), offset]);
    const countRes = await q(`SELECT COUNT(*) FROM business_rules WHERE ${conds.join(' AND ')}`, params);
    res.json({ rules: result.rows, total: parseInt(countRes.rows[0]?.count || 0) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /rules — create rule
router.post('/', requireRole('SUPER_ADMIN', 'OPERATIONS_ADMIN', 'RISK_ANALYST'), async (req, res) => {
  try {
    const q = await getQuery();
    const { name, description, category, conditions, actions, priority, environment, effectiveDate } = req.body;
    if (!name) return res.status(400).json({ error: 'Rule name is required' });
    const ruleId = genId('rule');
    await q(
      `INSERT INTO business_rules (rule_id, name, description, category, conditions, actions, priority, status, environment, effective_date, created_by, tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'DRAFT',$8,$9,$10,$11)`,
      [ruleId, name, description||null, category||'GENERAL', JSON.stringify(conditions||[]), JSON.stringify(actions||[]), priority||100, environment||'all', effectiveDate||null, req.admin.id, req.admin.tenant]
    );
    // Save version
    await q('INSERT INTO business_rule_versions (rule_id, version, name, conditions, actions, changed_by, change_reason) VALUES ($1,1,$2,$3,$4,$5,$6)',
      [ruleId, name, JSON.stringify(conditions||[]), JSON.stringify(actions||[]), req.admin.id, 'Initial creation']);
    await logAdminAction({ actorId: req.admin.id, targetId: ruleId, action: 'RULE_CREATED', details: { name, category } });
    res.status(201).json({ ruleId, name, status: 'DRAFT', version: 1 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /rules/:id — get rule detail
router.get('/:id', async (req, res) => {
  try {
    const q = await getQuery();
    const rule = await q('SELECT * FROM business_rules WHERE rule_id = $1', [req.params.id]);
    if (rule.rows.length === 0) return res.status(404).json({ error: 'Rule not found' });
    const versions = await q('SELECT * FROM business_rule_versions WHERE rule_id = $1 ORDER BY version DESC', [req.params.id]);
    res.json({ ...rule.rows[0], versions: versions.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /rules/:id — update rule (creates new version)
router.put('/:id', requireRole('SUPER_ADMIN', 'OPERATIONS_ADMIN', 'RISK_ANALYST'), async (req, res) => {
  try {
    const q = await getQuery();
    const existing = await q('SELECT * FROM business_rules WHERE rule_id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Rule not found' });
    const oldRule = existing.rows[0];
    const newVersion = (oldRule.version || 1) + 1;
    const { name, description, category, conditions, actions, priority, environment } = req.body;
    await q(
      `UPDATE business_rules SET name=COALESCE($1,name), description=COALESCE($2,description), category=COALESCE($3,category),
       conditions=COALESCE($4,conditions), actions=COALESCE($5,actions), priority=COALESCE($6,priority),
       environment=COALESCE($7,environment), version=$8, status='DRAFT', updated_at=NOW() WHERE rule_id=$9`,
      [name, description, category, conditions ? JSON.stringify(conditions) : null, actions ? JSON.stringify(actions) : null, priority, environment, newVersion, req.params.id]
    );
    await q('INSERT INTO business_rule_versions (rule_id, version, name, conditions, actions, changed_by, change_reason) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [req.params.id, newVersion, name||oldRule.name, JSON.stringify(conditions||oldRule.conditions), JSON.stringify(actions||oldRule.actions), req.admin.id, req.body.changeReason||'Updated']);
    await logAdminAction({ actorId: req.admin.id, targetId: req.params.id, action: 'RULE_UPDATED', details: { version: newVersion } });
    res.json({ ruleId: req.params.id, version: newVersion, status: 'DRAFT' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /rules/:id/approve — approve rule for production
router.post('/:id/approve', requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const q = await getQuery();
    const rule = await q('SELECT created_by FROM business_rules WHERE rule_id = $1', [req.params.id]);
    if (rule.rows.length === 0) return res.status(404).json({ error: 'Rule not found' });
    if (rule.rows[0].created_by === req.admin.id) return res.status(403).json({ error: 'Cannot approve your own rule (maker-checker)' });
    await q("UPDATE business_rules SET status='ACTIVE', approved_by=$1, approved_at=NOW(), updated_at=NOW() WHERE rule_id=$2", [req.admin.id, req.params.id]);
    await logAdminAction({ actorId: req.admin.id, targetId: req.params.id, action: 'RULE_APPROVED' });
    res.json({ ruleId: req.params.id, status: 'ACTIVE' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /rules/:id/disable — disable rule
router.post('/:id/disable', requireRole('SUPER_ADMIN', 'OPERATIONS_ADMIN'), async (req, res) => {
  try {
    const q = await getQuery();
    await q("UPDATE business_rules SET status='DISABLED', updated_at=NOW() WHERE rule_id=$1", [req.params.id]);
    await logAdminAction({ actorId: req.admin.id, targetId: req.params.id, action: 'RULE_DISABLED' });
    res.json({ ruleId: req.params.id, status: 'DISABLED' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /rules/:id/enable — re-enable rule
router.post('/:id/enable', requireRole('SUPER_ADMIN', 'OPERATIONS_ADMIN'), async (req, res) => {
  try {
    const q = await getQuery();
    await q("UPDATE business_rules SET status='ACTIVE', updated_at=NOW() WHERE rule_id=$1", [req.params.id]);
    await logAdminAction({ actorId: req.admin.id, targetId: req.params.id, action: 'RULE_ENABLED' });
    res.json({ ruleId: req.params.id, status: 'ACTIVE' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /rules/:id/rollback — rollback to a previous version
router.post('/:id/rollback', requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const q = await getQuery();
    const { targetVersion } = req.body;
    if (!targetVersion) return res.status(400).json({ error: 'targetVersion is required' });
    const versionData = await q('SELECT * FROM business_rule_versions WHERE rule_id = $1 AND version = $2', [req.params.id, targetVersion]);
    if (versionData.rows.length === 0) return res.status(404).json({ error: `Version ${targetVersion} not found` });
    const v = versionData.rows[0];
    const currentRule = await q('SELECT version FROM business_rules WHERE rule_id = $1', [req.params.id]);
    const newVersion = (currentRule.rows[0]?.version || 1) + 1;
    await q('UPDATE business_rules SET name=$1, conditions=$2, actions=$3, version=$4, status=\'DRAFT\', updated_at=NOW() WHERE rule_id=$5',
      [v.name, JSON.stringify(v.conditions), JSON.stringify(v.actions), newVersion, req.params.id]);
    await q('INSERT INTO business_rule_versions (rule_id, version, name, conditions, actions, changed_by, change_reason) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [req.params.id, newVersion, v.name, JSON.stringify(v.conditions), JSON.stringify(v.actions), req.admin.id, `Rollback to version ${targetVersion}`]);
    await logAdminAction({ actorId: req.admin.id, targetId: req.params.id, action: 'RULE_ROLLBACK', details: { fromVersion: currentRule.rows[0]?.version, toVersion: targetVersion } });
    res.json({ ruleId: req.params.id, version: newVersion, status: 'DRAFT', rolledBackFrom: targetVersion });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
