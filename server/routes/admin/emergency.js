/**
 * Phase 7: Emergency Operations Center API Routes
 * Backend-enforced emergency state controls
 */
import { Router } from 'express';
import { requireRole } from '../../middleware/adminAuth.js';
import { logAdminAction } from '../../middleware/auditLogger.js';
const router = Router();
let pgQuery = null;
async function getQuery() { if (!pgQuery) { const m = await import('../../../db/pg.js'); pgQuery = m.query; } return pgQuery; }

const EMERGENCY_TYPES = ['GLOBAL_BETTING_PAUSE','DEPOSITS_PAUSE','WITHDRAWALS_PAUSE','SPORT_PAUSE','COMPETITION_PAUSE','MARKET_SUSPENSION','PROVIDER_DISABLE','MAINTENANCE_MODE'];

// GET /emergency/state — current system state
router.get('/state', async (req, res) => {
  try {
    const q = await getQuery();
    const result = await q('SELECT * FROM emergency_states ORDER BY state_type');
    const activeStates = result.rows.filter(s => s.is_active);
    const systemStatus = activeStates.length === 0 ? 'NORMAL' : activeStates.map(s => s.state_type).join(', ');
    res.json({ systemStatus, isNormal: activeStates.length === 0, activeEmergencies: activeStates, allStates: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /emergency/activate — activate an emergency control
router.post('/activate', requireRole('SUPER_ADMIN', 'OPERATIONS_ADMIN'), async (req, res) => {
  try {
    const q = await getQuery();
    const { stateType, reason, scopeEntityType, scopeEntityId } = req.body;
    if (!stateType || !EMERGENCY_TYPES.includes(stateType)) return res.status(400).json({ error: `Invalid state type. Valid: ${EMERGENCY_TYPES.join(', ')}` });
    if (!reason || reason.length < 5) return res.status(400).json({ error: 'Reason is required (min 5 chars)' });

    const stateId = `emg_${stateType.toLowerCase()}_${Date.now()}`;
    await q(
      `INSERT INTO emergency_states (state_id, state_type, is_active, scope_entity_type, scope_entity_id, reason, activated_by, activated_at, tenant_id)
       VALUES ($1, $2, TRUE, $3, $4, $5, $6, NOW(), $7)
       ON CONFLICT (state_type) DO UPDATE SET is_active = TRUE, reason = $5, activated_by = $6, activated_at = NOW(), deactivated_by = NULL, deactivated_at = NULL, updated_at = NOW()`,
      [stateId, stateType, scopeEntityType || null, scopeEntityId || null, reason, req.admin.id, req.admin.tenant]
    );

    await q('INSERT INTO emergency_actions_log (state_type, action, reason, actor_id, correlation_id, tenant_id) VALUES ($1, $2, $3, $4, $5, $6)',
      [stateType, 'ACTIVATED', reason, req.admin.id, req.correlationId, req.admin.tenant]);
    await logAdminAction({ actorId: req.admin.id, action: `EMERGENCY_ACTIVATED:${stateType}`, details: { reason, stateType } });
    res.json({ stateType, status: 'ACTIVATED', reason, activatedBy: req.admin.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /emergency/deactivate — deactivate an emergency control
router.post('/deactivate', requireRole('SUPER_ADMIN', 'OPERATIONS_ADMIN'), async (req, res) => {
  try {
    const q = await getQuery();
    const { stateType, reason } = req.body;
    if (!stateType) return res.status(400).json({ error: 'stateType is required' });
    if (!reason) return res.status(400).json({ error: 'Reason is required' });

    await q('UPDATE emergency_states SET is_active = FALSE, deactivated_by = $1, deactivated_at = NOW(), updated_at = NOW() WHERE state_type = $2', [req.admin.id, stateType]);
    await q('INSERT INTO emergency_actions_log (state_type, action, reason, actor_id, correlation_id, tenant_id) VALUES ($1, $2, $3, $4, $5, $6)',
      [stateType, 'DEACTIVATED', reason, req.admin.id, req.correlationId, req.admin.tenant]);
    await logAdminAction({ actorId: req.admin.id, action: `EMERGENCY_DEACTIVATED:${stateType}`, details: { reason, stateType } });
    res.json({ stateType, status: 'DEACTIVATED', reason, deactivatedBy: req.admin.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /emergency/history — emergency actions history
router.get('/history', async (req, res) => {
  try {
    const q = await getQuery();
    const result = await q('SELECT * FROM emergency_actions_log ORDER BY created_at DESC LIMIT 100');
    res.json({ history: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
