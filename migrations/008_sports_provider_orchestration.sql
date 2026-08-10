-- Migration 008: Sports Provider Orchestration, Entity Mapping & Conflict Resolution

-- 1. CANONICAL PROVIDERS TABLE
CREATE TABLE IF NOT EXISTS canonical_providers (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(64) NOT NULL UNIQUE,
  priority INT DEFAULT 1,
  status VARCHAR(32) DEFAULT 'HEALTHY', -- HEALTHY | DEGRADED | DOWN | RATE_LIMITED
  quality_score NUMERIC(5,2) DEFAULT 100.00,
  latency_ms INT DEFAULT 0,
  last_ping_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. PROVIDER ENTITY MAPPINGS TABLE
CREATE TABLE IF NOT EXISTS provider_entity_mappings (
  id VARCHAR(64) PRIMARY KEY,
  entity_type VARCHAR(32) NOT NULL, -- SPORT | COMPETITION | TEAM | PLAYER | MATCH | MARKET
  provider_id VARCHAR(64) NOT NULL REFERENCES canonical_providers(id) ON DELETE CASCADE,
  provider_entity_id VARCHAR(128) NOT NULL,
  canonical_entity_id VARCHAR(128) NOT NULL,
  confidence_score NUMERIC(5,2) DEFAULT 100.00,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unq_provider_entity UNIQUE(provider_id, entity_type, provider_entity_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_canonical_entity ON provider_entity_mappings(entity_type, canonical_entity_id);

-- 3. MULTI-PROVIDER DATA CONFLICTS TABLE
CREATE TABLE IF NOT EXISTS data_conflicts (
  id VARCHAR(64) PRIMARY KEY,
  entity_type VARCHAR(32) NOT NULL,
  canonical_entity_id VARCHAR(128) NOT NULL,
  field_name VARCHAR(64) NOT NULL,
  provider_a_name VARCHAR(64) NOT NULL,
  provider_a_value TEXT NOT NULL,
  provider_b_name VARCHAR(64) NOT NULL,
  provider_b_value TEXT NOT NULL,
  status VARCHAR(32) DEFAULT 'OPEN', -- OPEN | RESOLVED | DISMISSED
  severity VARCHAR(32) DEFAULT 'MEDIUM', -- LOW | MEDIUM | HIGH | CRITICAL
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by VARCHAR(64)
);

CREATE INDEX IF NOT EXISTS idx_data_conflicts_status ON data_conflicts(status, severity);

-- 4. SPORTS DATA STALENESS AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS sports_data_staleness_logs (
  id VARCHAR(64) PRIMARY KEY,
  match_id VARCHAR(64) NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
  data_type VARCHAR(32) NOT NULL, -- ODDS | SCORE | MATCH_STATE
  data_age_seconds NUMERIC(8,2) NOT NULL,
  action_taken VARCHAR(64) NOT NULL, -- MARKET_SUSPENDED | WARNING_LOGGED
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_staleness_match ON sports_data_staleness_logs(match_id, created_at);
