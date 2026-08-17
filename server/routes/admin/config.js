/**
 * Phase 12: Configuration Versioning + Change Preview API Routes
 */
import { Router } from 'express';
import { requireRole } from '../../middleware/adminAuth.js';
import { logAdminAction } from '../../middleware/auditLogger.js';
const router = Router();
let pgQuery = null;
async function getQuery() { if (!pgQuery) { const m = await import('../../../db/pg.js'); pgQuery = m.query; } return pgQuery; }
function genId(p) { return `${p}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`; }

async function ensureTable() {
  const q = await getQuery();
  await q(`CREATE TABLE IF NOT EXISTS config_versions (
    version_id VARCHAR(64) PRIMARY KEY, config_key VARCHAR(255) NOT NULL, config_value JSONB NOT NULL,
    version INT NOT NULL DEFAULT 1, is_active BOOLEAN DEFAULT FALSE, category VARCHAR(64) DEFAULT 'GENERAL',
    changed_by VARCHAR(64) NOT NULL, approved_by VARCHAR(64), change_reason TEXT,
    tenant_id VARCHAR(64) DEFAULT 'oddsyra_in', created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  )`);
}

// GET /config/versions/:configKey — get all versions of a config
router.get('/versions/:configKey', async (req, res) => {
  try { await ensureTable(); const q = await getQuery();
    const result = await q('SELECT * FROM config_versions WHERE config_key = $1 ORDER BY version DESC', [req.params.configKey]);
    res.json({ configKey: req.params.configKey, versions: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /config/versions — create new version
router.post('/versions', requireRole('SUPER_ADMIN', 'OPERATIONS_ADMIN'), async (req, res) => {
  try { await ensureTable(); const q = await getQuery();
    const { configKey, configValue, category, changeReason } = req.body;
    if (!configKey || !configValue) return res.status(400).json({ error: 'configKey and configValue are required' });
    const existing = await q('SELECT MAX(version) as max_ver FROM config_versions WHERE config_key = $1', [configKey]);
    const newVersion = (existing.rows[0]?.max_ver || 0) + 1;
    const id = genId('cfgv');
    await q('INSERT INTO config_versions (version_id, config_key, config_value, version, category, changed_by, change_reason, tenant_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [id, configKey, JSON.stringify(configValue), newVersion, category||'GENERAL', req.admin.id, changeReason||null, req.admin.tenant]);
    await logAdminAction({ actorId: req.admin.id, targetId: configKey, action: 'CONFIG_VERSION_CREATED', details: { version: newVersion, configKey } });
    res.status(201).json({ versionId: id, configKey, version: newVersion });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /config/versions/:versionId/activate — activate a config version
router.post('/versions/:versionId/activate', requireRole('SUPER_ADMIN'), async (req, res) => {
  try { await ensureTable(); const q = await getQuery();
    const ver = await q('SELECT config_key, changed_by FROM config_versions WHERE version_id = $1', [req.params.versionId]);
    if (ver.rows.length === 0) return res.status(404).json({ error: 'Version not found' });
    if (ver.rows[0].changed_by === req.admin.id) return res.status(403).json({ error: 'Cannot activate your own config change (maker-checker)' });
    await q('UPDATE config_versions SET is_active = FALSE WHERE config_key = $1', [ver.rows[0].config_key]);
    await q('UPDATE config_versions SET is_active = TRUE, approved_by = $1 WHERE version_id = $2', [req.admin.id, req.params.versionId]);
    await logAdminAction({ actorId: req.admin.id, targetId: req.params.versionId, action: 'CONFIG_VERSION_ACTIVATED' });
    res.json({ versionId: req.params.versionId, status: 'ACTIVE' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /config/preview — change preview (before/after/impact)
router.post('/preview', async (req, res) => {
  try { await ensureTable(); const q = await getQuery();
    const { configKey, newValue } = req.body;
    if (!configKey) return res.status(400).json({ error: 'configKey is required' });
    const current = await q('SELECT config_value, version FROM config_versions WHERE config_key = $1 AND is_active = TRUE LIMIT 1', [configKey]);
    const before = current.rows[0]?.config_value || null;
    res.json({ configKey, before, after: newValue, currentVersion: current.rows[0]?.version || 0, impact: 'Preview generated — review changes before applying' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
