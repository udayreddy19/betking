-- Migration 020: Platform Expansion Ecosystem
-- Platform Integrity, CMS, Config Center, Feature Flags, Customer Segments, Affiliates

-- 1. PLATFORM INTEGRITY EXCEPTIONS
CREATE TABLE IF NOT EXISTS integrity_exceptions (
  id VARCHAR(64) PRIMARY KEY,
  check_type VARCHAR(64) NOT NULL, -- BET_SETTLEMENT_MISMATCH | WALLET_LEDGER_DRIFT | PAYMENT_WALLET_MISMATCH | TICKET_RESOLUTION_MISSING | BONUS_DUPLICATE | ODDS_STALE_MARKET_OPEN
  entity_type VARCHAR(64) NOT NULL, -- BET | WALLET | PAYMENT | TICKET | BONUS | MARKET
  entity_id VARCHAR(64) NOT NULL,
  expected_state VARCHAR(128) NOT NULL,
  actual_state VARCHAR(128) NOT NULL,
  severity VARCHAR(32) NOT NULL DEFAULT 'MEDIUM', -- LOW | MEDIUM | HIGH | CRITICAL
  owner VARCHAR(64),
  status VARCHAR(32) NOT NULL DEFAULT 'OPEN', -- OPEN | INVESTIGATING | RESOLVED | DISMISSED
  resolution TEXT,
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by VARCHAR(64)
);

CREATE INDEX IF NOT EXISTS idx_integrity_exc_status ON integrity_exceptions(status, severity);
CREATE INDEX IF NOT EXISTS idx_integrity_exc_type ON integrity_exceptions(check_type);
CREATE INDEX IF NOT EXISTS idx_integrity_exc_entity ON integrity_exceptions(entity_type, entity_id);

-- 2. CONTENT MANAGEMENT SYSTEM
CREATE TABLE IF NOT EXISTS cms_content (
  id VARCHAR(64) PRIMARY KEY,
  content_type VARCHAR(32) NOT NULL, -- BANNER | PROMOTION | ANNOUNCEMENT | FAQ | HELP | TERMS | CAMPAIGN | RESPONSIBLE_GAMING
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255),
  body TEXT NOT NULL,
  media_url VARCHAR(512),
  metadata JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT', -- DRAFT | REVIEW | PUBLISHED | SCHEDULED | EXPIRED | ARCHIVED
  version INT NOT NULL DEFAULT 1,
  tenant_id VARCHAR(64) DEFAULT 'tenant_default',
  published_at TIMESTAMP WITH TIME ZONE,
  scheduled_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_by VARCHAR(64) NOT NULL,
  updated_by VARCHAR(64),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cms_content_versions (
  id SERIAL PRIMARY KEY,
  content_id VARCHAR(64) NOT NULL REFERENCES cms_content(id) ON DELETE CASCADE,
  version INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  edited_by VARCHAR(64) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cms_content_type ON cms_content(content_type, status);
CREATE INDEX IF NOT EXISTS idx_cms_content_tenant ON cms_content(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cms_content_slug ON cms_content(slug);

-- 3. PLATFORM CONFIGURATION CENTER
CREATE TABLE IF NOT EXISTS platform_config (
  id VARCHAR(64) PRIMARY KEY,
  config_key VARCHAR(128) UNIQUE NOT NULL,
  config_value JSONB NOT NULL,
  category VARCHAR(64) NOT NULL DEFAULT 'GENERAL', -- GENERAL | BETTING | RISK | PAYMENT | SUPPORT | PROMOTIONS | RESPONSIBLE_GAMING | NOTIFICATION
  description TEXT,
  is_sensitive BOOLEAN DEFAULT FALSE,
  requires_maker_checker BOOLEAN DEFAULT FALSE,
  version INT NOT NULL DEFAULT 1,
  tenant_id VARCHAR(64) DEFAULT 'tenant_default',
  updated_by VARCHAR(64),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS platform_config_audit (
  id SERIAL PRIMARY KEY,
  config_id VARCHAR(64) NOT NULL REFERENCES platform_config(id) ON DELETE CASCADE,
  config_key VARCHAR(128) NOT NULL,
  previous_value JSONB,
  new_value JSONB NOT NULL,
  changed_by VARCHAR(64) NOT NULL,
  reason TEXT,
  version INT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_platform_config_key ON platform_config(config_key);
CREATE INDEX IF NOT EXISTS idx_platform_config_category ON platform_config(category);

-- 4. FEATURE FLAGS
CREATE TABLE IF NOT EXISTS feature_flags (
  id VARCHAR(64) PRIMARY KEY,
  flag_key VARCHAR(128) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT FALSE,
  rollout_percentage INT DEFAULT 100 CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
  tenant_scope JSONB DEFAULT '[]'::jsonb, -- array of tenant_ids, empty = all tenants
  user_segment_scope JSONB DEFAULT '[]'::jsonb, -- array of segment names, empty = all users
  environment VARCHAR(32) DEFAULT 'all', -- all | development | staging | production
  updated_by VARCHAR(64),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS feature_flag_audit (
  id SERIAL PRIMARY KEY,
  flag_id VARCHAR(64) NOT NULL REFERENCES feature_flags(id) ON DELETE CASCADE,
  flag_key VARCHAR(128) NOT NULL,
  previous_enabled BOOLEAN,
  new_enabled BOOLEAN NOT NULL,
  changed_by VARCHAR(64) NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_key ON feature_flags(flag_key);

-- 5. CUSTOMER SEGMENTS
CREATE TABLE IF NOT EXISTS customer_segments (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(128) UNIQUE NOT NULL,
  description TEXT,
  rules JSONB NOT NULL, -- { "conditions": [{ "field": "total_deposits", "operator": ">=", "value": 100000 }] }
  auto_evaluate BOOLEAN DEFAULT TRUE,
  member_count INT DEFAULT 0,
  created_by VARCHAR(64) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_segment_memberships (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  segment_id VARCHAR(64) NOT NULL REFERENCES customer_segments(id) ON DELETE CASCADE,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unq_user_segment UNIQUE(user_id, segment_id)
);

CREATE INDEX IF NOT EXISTS idx_user_segment_user ON user_segment_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_user_segment_segment ON user_segment_memberships(segment_id);

-- 6. AFFILIATE / PARTNER PLATFORM
CREATE TABLE IF NOT EXISTS affiliate_accounts (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  referral_code VARCHAR(64) UNIQUE NOT NULL,
  commission_rate NUMERIC(5,2) NOT NULL DEFAULT 5.00, -- percentage
  status VARCHAR(32) DEFAULT 'ACTIVE', -- ACTIVE | SUSPENDED | CLOSED
  total_clicks INT DEFAULT 0,
  total_conversions INT DEFAULT 0,
  total_commission_earned NUMERIC(14,2) DEFAULT 0.00,
  total_commission_paid NUMERIC(14,2) DEFAULT 0.00,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS affiliate_commissions (
  id VARCHAR(64) PRIMARY KEY,
  affiliate_id VARCHAR(64) NOT NULL REFERENCES affiliate_accounts(id) ON DELETE CASCADE,
  referred_user_id VARCHAR(64) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  event_type VARCHAR(32) NOT NULL, -- REGISTRATION | FIRST_DEPOSIT | BET_REVENUE
  amount NUMERIC(14,2) NOT NULL,
  status VARCHAR(32) DEFAULT 'PENDING', -- PENDING | APPROVED | PAID | REJECTED | FRAUD_REVIEW
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_affiliate_code ON affiliate_accounts(referral_code);
CREATE INDEX IF NOT EXISTS idx_affiliate_commission_aff ON affiliate_commissions(affiliate_id, status);

-- 7. VIP TIER HISTORY
CREATE TABLE IF NOT EXISTS vip_tier_history (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  previous_tier VARCHAR(32),
  new_tier VARCHAR(32) NOT NULL,
  reason VARCHAR(128) DEFAULT 'AUTOMATIC_EVALUATION',
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vip_tier_history_user ON vip_tier_history(user_id);
