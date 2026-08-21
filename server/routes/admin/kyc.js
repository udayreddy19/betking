import { Router } from 'express';
import { requirePermission } from '../../middleware/adminAuth.js';
import { kycEngine, maskPan, maskAadhaar } from '../../../lib/kycEngine.mjs';
import { query, queryRead } from '../../../db/pg.js';

const router = Router();

const PENDING_STATUSES = new Set(['UNDER_REVIEW', 'PENDING', 'RESUBMISSION_REQUIRED']);

async function resolveCaseId({ caseId, userId }) {
  if (caseId) return caseId;
  if (!userId) return null;
  const found = await query(
    `SELECT case_id FROM kyc_cases WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1`,
    [userId],
  );
  return found.rows[0]?.case_id || null;
}

// POST /api/admin/kyc/verify — Admin KYC verification review (approve / reject)
router.post('/verify', requirePermission('kyc', 'customers', 'risk'), async (req, res) => {
  const { caseId, userId, decision, notes } = req.body || {};
  try {
    const resolvedId = await resolveCaseId({ caseId, userId });
    if (!resolvedId) {
      return res.status(404).json({ error: 'KYC case not found for this user.' });
    }
    const result = await kycEngine.verifyKycCase({
      caseId: resolvedId,
      decision,
      reviewerId: req.admin?.id || 'admin',
      notes: notes || '',
    });
    res.json(result);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message, code: err.code });
  }
});

// GET /api/admin/kyc/cases — List pending KYC cases with user profile details
router.get('/cases', requirePermission('kyc', 'customers', 'risk'), async (req, res) => {
  const { status = 'UNDER_REVIEW', page = 1, limit = 50 } = req.query;
  try {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;
    const statusFilter = String(status || 'UNDER_REVIEW').toUpperCase();
    const statuses = statusFilter === 'ALL'
      ? ['UNDER_REVIEW', 'PENDING', 'RESUBMISSION_REQUIRED', 'VERIFIED', 'REJECTED']
      : statusFilter === 'PENDING_QUEUE'
        ? ['UNDER_REVIEW', 'PENDING', 'RESUBMISSION_REQUIRED']
        : [statusFilter];

    const result = await queryRead(
      `SELECT
          COALESCE(c.case_id, CONCAT('kyc_', p.user_id)) AS case_id,
          p.user_id,
          UPPER(COALESCE(c.status, p.kyc_status, 'NOT_STARTED')) AS status,
          c.pan_number,
          c.aadhaar_number,
          p.date_of_birth,
          c.reviewed_by,
          COALESCE(c.updated_at, p.updated_at) AS updated_at,
          u.email,
          u.phone,
          COALESCE(NULLIF(p.display_name, ''), split_part(COALESCE(u.email, ''), '@', 1), p.user_id) AS display_name,
          COALESCE(w.balance, 0) AS balance
       FROM user_profiles p
       LEFT JOIN LATERAL (
         SELECT *
         FROM kyc_cases kc
         WHERE kc.user_id = p.user_id
         ORDER BY kc.updated_at DESC NULLS LAST
         LIMIT 1
       ) c ON TRUE
       LEFT JOIN users u ON u.user_id = p.user_id
       LEFT JOIN wallets w ON w.user_id = p.user_id
       WHERE UPPER(COALESCE(c.status, p.kyc_status, '')) = ANY($1::text[])
       ORDER BY COALESCE(c.updated_at, p.updated_at) DESC NULLS LAST
       LIMIT $2 OFFSET $3`,
      [statuses, limitNum, offset],
    );

    const cases = (result.rows || []).map((row) => ({
      caseId: row.case_id,
      userId: row.user_id,
      status: row.status,
      reviewedBy: row.reviewed_by,
      updatedAt: row.updated_at,
      email: row.email || null,
      phone: row.phone || null,
      name: row.display_name || row.user_id,
      balance: Number(row.balance) || 0,
      dateOfBirth: row.date_of_birth ? String(row.date_of_birth).slice(0, 10) : null,
      panNumber: row.pan_number ? maskPan(row.pan_number) : null,
      aadhaarNumber: row.aadhaar_number ? maskAadhaar(row.aadhaar_number) : null,
      hasPan: Boolean(row.pan_number),
      hasAadhaar: Boolean(row.aadhaar_number),
      actionable: PENDING_STATUSES.has(String(row.status || '').toUpperCase()),
    }));

    res.json({ cases, page: pageNum, limit: limitNum, count: cases.length });
  } catch (err) {
    res.status(500).json({ error: err.message, cases: [] });
  }
});

export default router;
