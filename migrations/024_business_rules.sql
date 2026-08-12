-- Migration 024: Configurable Business Rules Engine with versioning
-- Extends existing risk_rules table with full rule lifecycle management

CREATE TABLE IF NOT EXISTS business_rules (
  rule_id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(64) NOT NULL DEFAULT 'GENERAL', -- BETTING | RISK | KYC | WITHDRAWAL | PAYMENT | SUPPORT_SLA | MARKET | PROMOTIONS | RESPONSIBLE_GAMING | GENERAL
  conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  priority INT DEFAULT 100,
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT', -- DRAFT | PENDING_APPROVAL | ACTIVE | DISABLED | ARCHIVED
  version INT DEFAULT 1,
  effective_date TIMESTAMP WITH TIME ZONE,
  expiry_date TIMESTAMP WITH TIME ZONE,
  environment VARCHAR(32) DEFAULT 'all', -- all | production | staging | development
  created_by VARCHAR(64) NOT NULL,
  approved_by VARCHAR(64),
  approved_at TIMESTAMP WITH TIME ZONE,
  tenant_id VARCHAR(64) DEFAULT 'betking_in',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_business_rules_status ON business_rules(status, category);
CREATE INDEX IF NOT EXISTS idx_business_rules_category ON business_rules(category, priority);

CREATE TABLE IF NOT EXISTS business_rule_versions (
  version_id SERIAL PRIMARY KEY,
  rule_id VARCHAR(64) NOT NULL REFERENCES business_rules(rule_id) ON DELETE CASCADE,
  version INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  conditions JSONB NOT NULL,
  actions JSONB NOT NULL,
  changed_by VARCHAR(64) NOT NULL,
  change_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rule_versions ON business_rule_versions(rule_id, version);
