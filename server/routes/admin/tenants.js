import { Router } from 'express';
import { requirePermission } from '../../middleware/adminAuth.js';
import {
  createWhiteLabelTenant,
  resolveTenantContext,
  getTenantSportsConfig,
  updateTenantSportsConfig,
  validateTenantAccess,
} from '../../../lib/tenantEngine.mjs';
import { query } from '../../../db/pg.js';

const router = Router();

// GET /api/admin/tenants — List all tenants
router.get('/', requirePermission('operations'), async (req, res) => {
  try {
    const isSuperAdmin = req.admin?.role === 'SUPER_ADMIN';
    const requesterTenant = req.admin?.tenant || 'tenant_default';

    let whereClause = '';
    const params = [];
    if (!isSuperAdmin) {
      whereClause = 'WHERE id = $1';
      params.push(requesterTenant);
    }

    const tRes = await query(`
      SELECT id, name, display_name, slug, domain, status, currency, timezone, branding, created_at
      FROM tenants ${whereClause} ORDER BY created_at DESC;
    `, params);

    res.json({ success: true, tenants: tRes.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/tenants — Provision New White-Label Tenant (Super Admin Only)
router.post('/', requirePermission('operations'), async (req, res) => {
  try {
    const isSuperAdmin = req.admin?.role === 'SUPER_ADMIN';
    if (!isSuperAdmin) return res.status(403).json({ error: 'Only Super Admin can provision new white-label tenants' });

    const tenant = await createWhiteLabelTenant(req.body);
    res.json(tenant);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/tenants/:id — Get Tenant Branding & Details
router.get('/:id', requirePermission('operations'), async (req, res) => {
  try {
    const targetTenantId = req.params.id;
    const isSuperAdmin = req.admin?.role === 'SUPER_ADMIN';
    validateTenantAccess({ requesterTenantId: req.admin?.tenant, targetTenantId, isSuperAdmin });

    const tenant = await resolveTenantContext({ headers: { 'x-tenant-id': targetTenantId } });
    res.json({ success: true, tenant });
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});

// PUT /api/admin/tenants/:id/branding — Update Tenant Branding
router.put('/:id/branding', requirePermission('operations'), async (req, res) => {
  try {
    const targetTenantId = req.params.id;
    const isSuperAdmin = req.admin?.role === 'SUPER_ADMIN';
    validateTenantAccess({ requesterTenantId: req.admin?.tenant, targetTenantId, isSuperAdmin });

    const { displayName, branding } = req.body;
    await query(`
      UPDATE tenants
      SET display_name = COALESCE($1, display_name),
          branding = COALESCE($2, branding),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3;
    `, [displayName, JSON.stringify(branding), targetTenantId]);

    res.json({ success: true, tenantId: targetTenantId, branding });
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});

// GET /api/admin/tenants/:id/config — Get Tenant Sports Config & Odds Margins
router.get('/:id/config', requirePermission('trading'), async (req, res) => {
  try {
    const targetTenantId = req.params.id;
    const sportId = req.query.sportId || 'cricket';
    const isSuperAdmin = req.admin?.role === 'SUPER_ADMIN';
    validateTenantAccess({ requesterTenantId: req.admin?.tenant, targetTenantId, isSuperAdmin });

    const config = await getTenantSportsConfig(targetTenantId, sportId);
    res.json({ success: true, config });
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});

// PUT /api/admin/tenants/:id/config — Update Tenant Sports Config & Odds Margins
router.put('/:id/config', requirePermission('trading'), async (req, res) => {
  try {
    const targetTenantId = req.params.id;
    const sportId = req.body.sportId || 'cricket';
    const isSuperAdmin = req.admin?.role === 'SUPER_ADMIN';
    validateTenantAccess({ requesterTenantId: req.admin?.tenant, targetTenantId, isSuperAdmin });

    const updated = await updateTenantSportsConfig(targetTenantId, sportId, req.body);
    res.json(updated);
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});

export default router;
