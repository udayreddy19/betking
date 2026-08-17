import { query } from '../db/pg.js';

/**
 * Enterprise Multi-Tenant & White-Label Security Manager
 * Enforces server-side tenant resolution and cross-tenant data isolation.
 */

/**
 * 1. Server-Side Tenant Context Resolution
 */
export async function resolveTenantContext(req) {
  const headerTenantId = req?.headers ? req.headers['x-tenant-id'] : null;
  const host = req?.headers ? (req.headers['host'] || req.headers['x-forwarded-host']) : null;

  let tRes = { rows: [] };

  if (headerTenantId) {
    tRes = await query(`
      SELECT id, name, display_name, slug, domain, status, currency, timezone, branding
      FROM tenants WHERE id = $1 OR slug = $1 LIMIT 1;
    `, [headerTenantId]);
  } else if (host) {
    tRes = await query(`
      SELECT id, name, display_name, slug, domain, status, currency, timezone, branding
      FROM tenants WHERE domain = $1 OR domain LIKE $2 LIMIT 1;
    `, [host, `%${host}%`]);
  }

  if (tRes.rows.length === 0) {
    tRes = await query(`
      SELECT id, name, display_name, slug, domain, status, currency, timezone, branding
      FROM tenants WHERE id = 'tenant_default' LIMIT 1;
    `);
  }

  if (tRes.rows.length > 0) {
    const t = tRes.rows[0];
    return {
      id: t.id,
      name: t.name,
      displayName: t.display_name,
      slug: t.slug,
      domain: t.domain,
      status: t.status,
      currency: t.currency,
      timezone: t.timezone,
      branding: typeof t.branding === 'string' ? JSON.parse(t.branding) : (t.branding || {}),
    };
  }

  // Fallback to Default Tenant
  return {
    id: 'tenant_default',
    name: 'OddsYra Core',
    displayName: 'OddsYra Sportsbook',
    slug: 'oddsyra',
    domain: 'localhost',
    status: 'ACTIVE',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    branding: { primaryColor: '#10b981', logo: '/assets/logo.png' },
  };
}

/**
 * 2. Enforce Cross-Tenant Authorization Guard
 */
export function validateTenantAccess({
  requesterTenantId,
  targetTenantId,
  isSuperAdmin = false,
}) {
  if (isSuperAdmin) return { allowed: true, reason: 'SUPER_ADMIN_OVERRIDE' };
  if (!requesterTenantId || !targetTenantId) throw new Error('TENANT_SECURITY_ERROR: Missing tenant context');

  if (requesterTenantId !== targetTenantId) {
    throw new Error(`TENANT_ACCESS_DENIED: Requester tenant '${requesterTenantId}' cannot access target tenant '${targetTenantId}' data`);
  }

  return { allowed: true };
}

/**
 * 3. Provision New White-Label Tenant
 */
export async function createWhiteLabelTenant({
  id,
  name,
  displayName,
  slug,
  domain,
  currency = 'INR',
  timezone = 'Asia/Kolkata',
  branding = {},
}) {
  const tenantId = id || `tenant_${slug.toLowerCase()}`;

  await query(`
    INSERT INTO tenants (id, name, display_name, slug, domain, status, currency, timezone, branding)
    VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6, $7, $8)
    ON CONFLICT (id) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      domain = EXCLUDED.domain,
      branding = EXCLUDED.branding,
      updated_at = CURRENT_TIMESTAMP;
  `, [tenantId, name, displayName, slug, domain, currency, timezone, JSON.stringify(branding)]);

  return {
    success: true,
    tenantId,
    name,
    displayName,
    slug,
    domain,
    status: 'ACTIVE',
    currency,
  };
}

/**
 * 4. Fetch Tenant Sports Betting Configuration & Odds Margin
 */
export async function getTenantSportsConfig(tenantId = 'tenant_default', sportId = 'cricket') {
  const configRes = await query(`
    SELECT margin_percentage, min_stake, max_stake, max_payout, enabled
    FROM tenant_sports_config
    WHERE tenant_id = $1 AND sport_id = $2;
  `, [tenantId, sportId]);

  if (configRes.rows.length > 0) {
    const c = configRes.rows[0];
    return {
      tenantId,
      sportId,
      marginPercentage: parseFloat(c.margin_percentage),
      minStake: parseFloat(c.min_stake),
      maxStake: parseFloat(c.max_stake),
      maxPayout: parseFloat(c.max_payout),
      enabled: c.enabled,
    };
  }

  // Default Fallback Config
  return {
    tenantId,
    sportId,
    marginPercentage: 5.00, // 5% default margin
    minStake: 10.00,
    maxStake: 100000.00,
    maxPayout: 500000.00,
    enabled: true,
  };
}

/**
 * 5. Update Tenant Sports Betting Configuration & Odds Margin
 */
export async function updateTenantSportsConfig(tenantId, sportId, config = {}) {
  const { marginPercentage = 5.00, minStake = 10.00, maxStake = 100000.00, maxPayout = 500000.00, enabled = true } = config;

  // Auto-upsert sport_id to satisfy foreign key constraint if needed
  await query(`
    INSERT INTO sports (sport_id, name, slug)
    VALUES ($1::varchar(32), UPPER($1::text), LOWER($1::text) || '_' || SUBSTRING(MD5($1::text), 1, 6))
    ON CONFLICT DO NOTHING;
  `, [sportId]);

  await query(`
    INSERT INTO tenant_sports_config (tenant_id, sport_id, margin_percentage, min_stake, max_stake, max_payout, enabled)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (tenant_id, sport_id) DO UPDATE SET
      margin_percentage = EXCLUDED.margin_percentage,
      min_stake = EXCLUDED.min_stake,
      max_stake = EXCLUDED.max_stake,
      max_payout = EXCLUDED.max_payout,
      enabled = EXCLUDED.enabled;
  `, [tenantId, sportId, marginPercentage, minStake, maxStake, maxPayout, enabled]);

  return {
    success: true,
    tenantId,
    sportId,
    marginPercentage,
    minStake,
    maxStake,
    maxPayout,
    enabled,
  };
}
