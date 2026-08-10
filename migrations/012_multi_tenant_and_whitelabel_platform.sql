-- Migration 012: Multi-Tenant, White-Label & Sportsbook Platform Architecture

-- 1. TENANTS REGISTRY TABLE
CREATE TABLE IF NOT EXISTS tenants (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(128) NOT NULL UNIQUE,
  display_name VARCHAR(128) NOT NULL,
  slug VARCHAR(64) UNIQUE NOT NULL,
  domain VARCHAR(255) UNIQUE NOT NULL,
  status VARCHAR(32) DEFAULT 'ACTIVE', -- ACTIVE | SUSPENDED | MAINTENANCE | DISABLED
  currency VARCHAR(8) DEFAULT 'INR',
  timezone VARCHAR(64) DEFAULT 'Asia/Kolkata',
  branding JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seed Default BetKing Tenant
INSERT INTO tenants (id, name, display_name, slug, domain, status, currency, branding)
VALUES ('tenant_default', 'BetKing Core', 'BetKing Sportsbook', 'betking', 'localhost', 'ACTIVE', 'INR', '{"primaryColor": "#10b981", "logo": "/assets/logo.png"}')
ON CONFLICT (id) DO NOTHING;

-- 2. TENANT SPORTS & ODDS CONFIGURATION TABLE
CREATE TABLE IF NOT EXISTS tenant_sports_config (
  tenant_id VARCHAR(64) REFERENCES tenants(id) ON DELETE CASCADE,
  sport_id VARCHAR(32) REFERENCES sports(sport_id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT TRUE,
  margin_percentage NUMERIC(5,2) DEFAULT 5.00,
  min_stake NUMERIC(14,2) DEFAULT 10.00,
  max_stake NUMERIC(14,2) DEFAULT 100000.00,
  max_payout NUMERIC(14,2) DEFAULT 500000.00,
  PRIMARY KEY (tenant_id, sport_id)
);

-- 3. ENSURE TENANT_ID COLUMNS & COMPOSITE INDEXES ON TENANT-SCOPED TABLES
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'tenant_default';
ALTER TABLE bets ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'tenant_default';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'tenant_default';
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'tenant_default';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'tenant_default';

CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wallets_tenant ON wallets(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_bets_tenant ON bets(tenant_id, user_id, status);
CREATE INDEX IF NOT EXISTS idx_tx_tenant ON transactions(tenant_id, user_id, status);
