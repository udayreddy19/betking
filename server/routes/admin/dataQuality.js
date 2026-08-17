/**
 * Phase 13: Data Quality Center API Routes
 */
import { Router } from 'express';
import { logAdminAction } from '../../middleware/auditLogger.js';
const router = Router();
let pgQuery = null;
async function getQuery() { if (!pgQuery) { const m = await import('../../../db/pg.js'); pgQuery = m.query; } return pgQuery; }
function genId(p) { return `${p}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`; }

async function ensureTable() {
  const q = await getQuery();
  await q(`CREATE TABLE IF NOT EXISTS data_quality_issues (
    issue_id VARCHAR(64) PRIMARY KEY, issue_type VARCHAR(64) NOT NULL, severity VARCHAR(16) DEFAULT 'MEDIUM',
    entity_type VARCHAR(64) NOT NULL, entity_id VARCHAR(128), description TEXT NOT NULL,
    details JSONB DEFAULT '{}'::jsonb, owner_id VARCHAR(64), status VARCHAR(32) DEFAULT 'OPEN',
    resolution TEXT, tenant_id VARCHAR(64) DEFAULT 'oddsyra_in',
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, resolved_at TIMESTAMP WITH TIME ZONE
  )`);
}

router.get('/', async (req, res) => {
  try { await ensureTable(); const q = await getQuery();
    const { status, issueType, severity } = req.query;
    const conds = ['tenant_id = $1']; const params = [req.admin.tenant]; let i = 2;
    if (status) { conds.push(`status = $${i++}`); params.push(status); }
    if (issueType) { conds.push(`issue_type = $${i++}`); params.push(issueType); }
    if (severity) { conds.push(`severity = $${i++}`); params.push(severity); }
    const result = await q(`SELECT * FROM data_quality_issues WHERE ${conds.join(' AND ')} ORDER BY detected_at DESC LIMIT 100`, params);
    res.json({ issues: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/scan', async (req, res) => {
  try { await ensureTable(); const q = await getQuery();
    // Run data quality checks
    const issues = [];
    // Check for duplicate users by email
    const dupes = await q("SELECT email, COUNT(*) as cnt FROM users GROUP BY email HAVING COUNT(*) > 1");
    for (const d of dupes.rows) {
      const id = genId('dq');
      await q('INSERT INTO data_quality_issues (issue_id, issue_type, severity, entity_type, description, details, tenant_id) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [id, 'DUPLICATE_USER', 'HIGH', 'user', `Duplicate email: ${d.email} (${d.cnt} records)`, JSON.stringify({ email: d.email, count: d.cnt }), req.admin.tenant]);
      issues.push({ issueId: id, type: 'DUPLICATE_USER', email: d.email });
    }
    // Check for orphan bets (bet with no user)
    const orphanBets = await q("SELECT b.bet_id FROM bets b LEFT JOIN users u ON b.user_id = u.user_id WHERE u.user_id IS NULL LIMIT 10");
    for (const b of orphanBets.rows) {
      const id = genId('dq');
      await q('INSERT INTO data_quality_issues (issue_id, issue_type, severity, entity_type, entity_id, description, tenant_id) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [id, 'ORPHAN_RECORD', 'HIGH', 'bet', b.bet_id, `Orphan bet: no matching user`, req.admin.tenant]);
      issues.push({ issueId: id, type: 'ORPHAN_RECORD', betId: b.bet_id });
    }
    await logAdminAction({ actorId: req.admin.id, action: 'DATA_QUALITY_SCAN', details: { issuesFound: issues.length } });
    res.json({ scanComplete: true, issuesFound: issues.length, issues });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id/resolve', async (req, res) => {
  try { await ensureTable(); const q = await getQuery();
    if (!req.body.resolution) return res.status(400).json({ error: 'Resolution is required' });
    await q("UPDATE data_quality_issues SET status = 'RESOLVED', resolution = $1, owner_id = $2, resolved_at = NOW() WHERE issue_id = $3",
      [req.body.resolution, req.admin.id, req.params.id]);
    res.json({ issueId: req.params.id, status: 'RESOLVED' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
