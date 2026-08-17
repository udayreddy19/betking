/**
 * Phase 18: Saved Views
 */
import { Router } from 'express';
const router = Router();
let pgQuery = null;
async function getQuery() { if (!pgQuery) { const m = await import('../../../db/pg.js'); pgQuery = m.query; } return pgQuery; }
function genId(p) { return `${p}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`; }

async function ensureTable() {
  const q = await getQuery();
  await q(`CREATE TABLE IF NOT EXISTS saved_views (
    view_id VARCHAR(64) PRIMARY KEY, name VARCHAR(255) NOT NULL, filters JSONB DEFAULT '{}'::jsonb,
    columns JSONB DEFAULT '[]'::jsonb, sort_by VARCHAR(64), sort_dir VARCHAR(4) DEFAULT 'DESC',
    entity_type VARCHAR(64) DEFAULT 'bets', owner_id VARCHAR(64) NOT NULL,
    visibility VARCHAR(32) DEFAULT 'PRIVATE', tenant_id VARCHAR(64) DEFAULT 'oddsyra_in',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  )`);
}

router.get('/', async (req, res) => {
  try { await ensureTable(); const q = await getQuery();
    const result = await q("SELECT * FROM saved_views WHERE (owner_id = $1 OR visibility = 'PUBLIC') AND tenant_id = $2 ORDER BY created_at DESC", [req.admin.id, req.admin.tenant]);
    res.json({ views: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try { await ensureTable(); const q = await getQuery();
    const { name, filters, columns, sortBy, sortDir, entityType, visibility } = req.body;
    if (!name) return res.status(400).json({ error: 'View name is required' });
    const id = genId('view');
    await q('INSERT INTO saved_views (view_id, name, filters, columns, sort_by, sort_dir, entity_type, owner_id, visibility, tenant_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [id, name, JSON.stringify(filters||{}), JSON.stringify(columns||[]), sortBy||null, sortDir||'DESC', entityType||'bets', req.admin.id, visibility||'PRIVATE', req.admin.tenant]);
    res.status(201).json({ viewId: id, name });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try { await ensureTable(); const q = await getQuery();
    await q('DELETE FROM saved_views WHERE view_id = $1 AND owner_id = $2', [req.params.id, req.admin.id]);
    res.json({ viewId: req.params.id, status: 'DELETED' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
