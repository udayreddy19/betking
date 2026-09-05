/**
 * Phase 14: Provider Control Center — uses existing provider_health_logs table
 */
import { Router } from 'express';
import { requirePermission } from '../../middleware/adminAuth.js';
import { logAdminAction } from '../../middleware/auditLogger.js';
const router = Router();
let pgQuery = null;
async function getQuery() { if (!pgQuery) { const m = await import('../../../db/pg.js'); pgQuery = m.query; } return pgQuery; }

// GET /providers/health-matrix — Realtime health & fallback matrix
router.get('/health-matrix', requirePermission('operations', 'providers'), async (req, res) => {
  try {
    const { providerHealthEngine } = await import('../../../lib/providerHealthEngine.mjs');
    const { sportsDataRegistry } = await import('../../../lib/sportsDataRegistry.mjs');

    const providers = ['cricbuzz', 'espn', 'fancode', 'srl_engine', 'flashscore', 'cricketguru', 'cricketliveline'];
    const matrix = providers.map(p => {
      const state = providerHealthEngine.getProviderState(p);
      const freshness = providerHealthEngine.evaluateFreshness(p);
      return {
        ...state,
        freshnessStatus: freshness,
      };
    });

    const activeFallback = providerHealthEngine.getOperationalProvider('cricket', 'cricbuzz', 'espn');

    res.json({
      success: true,
      providers: matrix,
      activeFallback,
      mappedMatches: sportsDataRegistry.getAllMatches().length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', requirePermission('operations', 'providers'), async (req, res) => {
  try {
    const q = await getQuery();
    const result = await q('SELECT * FROM provider_health_logs ORDER BY created_at DESC LIMIT 100');
    const mappingsRes = await q('SELECT COUNT(*) as mapped_count, mapping_status FROM provider_entity_mappings GROUP BY mapping_status');
    const conflictsRes = await q('SELECT * FROM data_conflicts WHERE status = \'OPEN\' ORDER BY created_at DESC LIMIT 20');

    res.json({
      providers: result.rows,
      mappingsSummary: mappingsRes.rows,
      openConflicts: conflictsRes.rows,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:providerName/history', requirePermission('operations', 'providers'), async (req, res) => {
  try {
    const q = await getQuery();
    const result = await q('SELECT * FROM provider_health_logs WHERE provider_name = $1 ORDER BY created_at DESC LIMIT 50', [req.params.providerName]);
    res.json({ provider: req.params.providerName, history: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
