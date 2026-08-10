-- Migration 006: Admin Operations, Maker-Checker Dual Approvals & System Incidents

-- 1. MAKER-CHECKER DUAL APPROVAL REQUESTS TABLE
CREATE TABLE IF NOT EXISTS maker_checker_requests (
  id VARCHAR(64) PRIMARY KEY,
  action_type VARCHAR(64) NOT NULL, -- WALLET_ADJUSTMENT | ACCOUNT_RELEASE | SETTLEMENT_CORRECTION | WITHDRAWAL_OVERRIDE
  target_entity_type VARCHAR(64) NOT NULL,
  target_entity_id VARCHAR(64) NOT NULL,
  request_payload JSONB NOT NULL,
  status VARCHAR(32) DEFAULT 'PENDING_APPROVAL', -- PENDING_APPROVAL | APPROVED | REJECTED
  maker_id VARCHAR(64) NOT NULL,
  checker_id VARCHAR(64),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  approved_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_maker_checker_status ON maker_checker_requests(status);
CREATE INDEX IF NOT EXISTS idx_maker_checker_entity ON maker_checker_requests(target_entity_type, target_entity_id);

-- 2. SYSTEM INCIDENTS AUDIT TABLE
CREATE TABLE IF NOT EXISTS system_incidents (
  id VARCHAR(64) PRIMARY KEY,
  component_name VARCHAR(64) NOT NULL,
  severity VARCHAR(32) DEFAULT 'MEDIUM', -- LOW | MEDIUM | HIGH | CRITICAL
  status VARCHAR(32) DEFAULT 'DETECTED', -- DETECTED | INVESTIGATING | MITIGATING | RESOLVED
  title VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_system_incidents_status ON system_incidents(status, severity);

-- 3. PROVIDER HEALTH LOGS TABLE
CREATE TABLE IF NOT EXISTS provider_health_logs (
  id VARCHAR(64) PRIMARY KEY,
  provider_name VARCHAR(64) NOT NULL,
  status VARCHAR(32) DEFAULT 'HEALTHY', -- HEALTHY | DEGRADED | DOWN
  latency_ms INT DEFAULT 0,
  error_count INT DEFAULT 0,
  last_success_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_provider_health ON provider_health_logs(provider_name, status);
