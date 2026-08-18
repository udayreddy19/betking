import { Router } from 'express';
import { requirePermission } from '../../middleware/adminAuth.js';
import { kycEngine } from '../../../lib/kycEngine.mjs';
import { query } from '../../../db/pg.js';

const router = Router();

// POST /api/admin/kyc/verify — Admin KYC verification review
router.post('/verify', requirePermission('kyc', 'admin'), async (req, res) => {
  const { caseId, decision, notes } = req.body;
  try {
    const result = await kycEngine.verifyKycCase({
      caseId,
      decision,
      reviewerId: req.admin?.id || 'admin',
      notes,
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/admin/kyc/cases — List pending KYC cases
router.get('/cases', requirePermission('kyc', 'admin'), async (req, res) => {
  const { status = 'UNDER_REVIEW', page = 1, limit = 25 } = req.query;
  try {
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const result = await query(
      `SELECT case_id, user_id, status, pan_number, aadhaar_number, reviewed_by, updated_at
       FROM kyc_cases
       WHERE status = $1
       ORDER BY updated_at DESC
       LIMIT $2 OFFSET $3`,
      [status, parseInt(limit), offset]
    );

    const maskedCases = result.rows.map((row) => ({
      caseId: row.case_id,
      userId: row.user_id,
      status: row.status,
      reviewedBy: row.reviewed_by,
      updatedAt: row.updated_at,
      panNumber: row.pan_number ? `XXXXXX${row.pan_number.slice(-4)}` : null,
      aadhaarNumber: row.aadhaar_number ? `XXXXXXXX${row.aadhaar_number.slice(-4)}` : null,
    }));

    res.json({ cases: maskedCases, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
