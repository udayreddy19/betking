-- Migration 025: Entity Timeline Events
-- Chronological history for all important platform entities

CREATE TABLE IF NOT EXISTS entity_timeline_events (
  event_id VARCHAR(64) PRIMARY KEY,
  entity_type VARCHAR(64) NOT NULL, -- user | bet | transaction | wallet | withdrawal | deposit | ticket | kyc_case | fraud_case | match | market | incident | configuration | approval
  entity_id VARCHAR(128) NOT NULL,
  event_type VARCHAR(128) NOT NULL, -- CREATED | UPDATED | STATUS_CHANGED | ASSIGNED | etc.
  event_category VARCHAR(64) DEFAULT 'SYSTEM', -- SYSTEM | USER_ACTION | ADMIN_ACTION | AUTOMATED
  actor_id VARCHAR(64),
  actor_type VARCHAR(32) DEFAULT 'system', -- system | user | admin | automated
  status VARCHAR(32),
  description TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  correlation_id VARCHAR(128),
  tenant_id VARCHAR(64) DEFAULT 'oddsyra_in',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_timeline_entity ON entity_timeline_events(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_timeline_correlation ON entity_timeline_events(correlation_id);
CREATE INDEX IF NOT EXISTS idx_timeline_actor ON entity_timeline_events(actor_id, created_at DESC);

-- Migration 026: Emergency Operations Center
CREATE TABLE IF NOT EXISTS emergency_states (
  state_id VARCHAR(64) PRIMARY KEY,
  state_type VARCHAR(64) NOT NULL UNIQUE, -- GLOBAL_BETTING_PAUSE | DEPOSITS_PAUSE | WITHDRAWALS_PAUSE | SPORT_PAUSE | COMPETITION_PAUSE | MARKET_SUSPENSION | PROVIDER_DISABLE | MAINTENANCE_MODE
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  scope_entity_type VARCHAR(64), -- sport | competition | market | provider
  scope_entity_id VARCHAR(128),
  reason TEXT NOT NULL,
  activated_by VARCHAR(64),
  activated_at TIMESTAMP WITH TIME ZONE,
  deactivated_by VARCHAR(64),
  deactivated_at TIMESTAMP WITH TIME ZONE,
  requires_approval BOOLEAN DEFAULT FALSE,
  approval_workflow_id VARCHAR(64),
  tenant_id VARCHAR(64) DEFAULT 'oddsyra_in',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_emergency_active ON emergency_states(is_active, state_type);

CREATE TABLE IF NOT EXISTS emergency_actions_log (
  log_id SERIAL PRIMARY KEY,
  state_type VARCHAR(64) NOT NULL,
  action VARCHAR(32) NOT NULL, -- ACTIVATED | DEACTIVATED
  reason TEXT NOT NULL,
  actor_id VARCHAR(64) NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  correlation_id VARCHAR(128),
  tenant_id VARCHAR(64) DEFAULT 'oddsyra_in',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_emergency_log ON emergency_actions_log(state_type, created_at DESC);

-- Migration 027: Admin Security Center
CREATE TABLE IF NOT EXISTS admin_sessions (
  session_id VARCHAR(64) PRIMARY KEY,
  admin_id VARCHAR(64) NOT NULL,
  ip_address VARCHAR(45) NOT NULL,
  user_agent TEXT,
  device_type VARCHAR(32) DEFAULT 'Desktop',
  is_active BOOLEAN DEFAULT TRUE,
  mfa_verified BOOLEAN DEFAULT FALSE,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_active_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  terminated_at TIMESTAMP WITH TIME ZONE,
  terminated_by VARCHAR(64),
  termination_reason TEXT,
  tenant_id VARCHAR(64) DEFAULT 'oddsyra_in'
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin ON admin_sessions(admin_id, is_active);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_active ON admin_sessions(is_active, last_active_at);

CREATE TABLE IF NOT EXISTS admin_login_history (
  login_id SERIAL PRIMARY KEY,
  admin_id VARCHAR(64) NOT NULL,
  ip_address VARCHAR(45) NOT NULL,
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT TRUE,
  failure_reason TEXT,
  mfa_used BOOLEAN DEFAULT FALSE,
  tenant_id VARCHAR(64) DEFAULT 'oddsyra_in',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_logins ON admin_login_history(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logins_failed ON admin_login_history(success, created_at DESC) WHERE success = FALSE;

CREATE TABLE IF NOT EXISTS admin_privilege_changes (
  change_id SERIAL PRIMARY KEY,
  admin_id VARCHAR(64) NOT NULL,
  change_type VARCHAR(64) NOT NULL, -- ROLE_CHANGE | PERMISSION_GRANT | PERMISSION_REVOKE | MFA_RESET | ACCOUNT_DISABLE | ACCOUNT_ENABLE
  old_value TEXT,
  new_value TEXT,
  changed_by VARCHAR(64) NOT NULL,
  reason TEXT,
  tenant_id VARCHAR(64) DEFAULT 'oddsyra_in',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_priv_changes ON admin_privilege_changes(admin_id, created_at DESC);
