import { Router } from 'express';
import { requirePermission } from '../../middleware/adminAuth.js';
import { query } from '../../../db/pg.js';

const router = Router();

// GET /api/admin/risk/signals — Admin risk signals list
router.get('/signals', requirePermission('security', 'risk', 'fraud'), async (req, res) => {
  const { userId, severity, signalType, status = 'NEW', page = 1, limit = 25 } = req.query;
  try {
    const conds = [];
    const params = [];
    let i = 1;

    if (userId) { conds.push(`user_id = $${i++}`); params.push(userId); }
    if (severity) { conds.push(`severity = $${i++}`); params.push(severity); }
    if (signalType) { conds.push(`signal_type = $${i++}`); params.push(signalType); }
    if (status) { conds.push(`status = $${i++}`); params.push(status); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const result = await query(
      `SELECT * FROM risk_signals ${where} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i++}`,
      [...params, parseInt(limit), offset]
    );

    const countRes = await query(`SELECT COUNT(*) FROM risk_signals ${where}`, params);

    res.json({
      signals: result.rows,
      total: parseInt(countRes.rows[0]?.count || 0),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
