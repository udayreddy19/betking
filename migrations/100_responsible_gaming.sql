-- Migration 100: Responsible Gaming & Player Safety Controls
-- Tables for deposit limits, self-exclusion, and reality checks

CREATE TABLE IF NOT EXISTS user_deposit_limits (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  daily_limit NUMERIC(12,2),
  weekly_limit NUMERIC(12,2),
  monthly_limit NUMERIC(12,2),
  pending_daily_limit NUMERIC(12,2),
  pending_limit_effective_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_self_exclusions (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  duration_type VARCHAR(32) NOT NULL, -- 24H, 7D, 30D, 6MONTHS, PERMANENT
  expires_at TIMESTAMP WITH TIME ZONE,
  is_permanent BOOLEAN DEFAULT FALSE,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_reality_checks (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  interval_minutes INTEGER DEFAULT 60,
  is_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_self_exclusion_user ON user_self_exclusions (user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_deposit_limits_user ON user_deposit_limits (user_id);
