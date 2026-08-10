-- Migration 018: Responsible Gaming Limits, Cooling-Off, Self-Exclusion & Compliance Ecosystem

CREATE TABLE IF NOT EXISTS responsible_gaming_limits (
  user_id VARCHAR(64) PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  deposit_limit_daily NUMERIC(12, 2) DEFAULT 50000.00,
  deposit_limit_weekly NUMERIC(12, 2) DEFAULT 250000.00,
  deposit_limit_monthly NUMERIC(12, 2) DEFAULT 1000000.00,
  loss_limit_daily NUMERIC(12, 2) DEFAULT 25000.00,
  stake_limit_per_bet NUMERIC(12, 2) DEFAULT 50000.00,
  session_limit_minutes INT DEFAULT 180,
  cooling_off_until TIMESTAMP WITH TIME ZONE,
  self_excluded_until TIMESTAMP WITH TIME ZONE,
  reality_check_interval_mins INT DEFAULT 60,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS responsible_gaming_audit_logs (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  action_type VARCHAR(64) NOT NULL, -- LIMIT_CREATED | LIMIT_MODIFIED | COOLING_OFF_STARTED | SELF_EXCLUSION_STARTED | LIMIT_VIOLATION_BLOCKED
  old_value JSONB,
  new_value JSONB,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rg_audit_user ON responsible_gaming_audit_logs(user_id);
