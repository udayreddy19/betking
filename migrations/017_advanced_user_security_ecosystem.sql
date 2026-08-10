-- Migration 017: Advanced User Security, Device Management, Security Alerts & Account Controls Ecosystem

CREATE TABLE IF NOT EXISTS user_devices (
  device_id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  device_hash VARCHAR(128) NOT NULL,
  device_type VARCHAR(32) DEFAULT 'Desktop', -- Desktop | Mobile | Tablet
  platform VARCHAR(64) DEFAULT 'Web',
  browser VARCHAR(64) DEFAULT 'Chrome',
  os VARCHAR(64) DEFAULT 'macOS',
  ip_address VARCHAR(45) NOT NULL DEFAULT '127.0.0.1',
  location_city VARCHAR(128) DEFAULT 'Mumbai',
  location_country VARCHAR(64) DEFAULT 'India',
  trust_status VARCHAR(32) DEFAULT 'UNTRUSTED', -- TRUSTED | UNTRUSTED | BLOCKED
  is_active_session BOOLEAN DEFAULT TRUE,
  first_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_devices_user ON user_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_user_devices_hash ON user_devices(device_hash);

CREATE TABLE IF NOT EXISTS user_security_alerts (
  alert_id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  alert_type VARCHAR(64) NOT NULL, -- NEW_DEVICE_LOGIN | SUSPICIOUS_LOGIN | PASSWORD_CHANGED | EMAIL_CHANGED | PHONE_CHANGED | MFA_CHANGED | WITHDRAWAL_SECURITY_CHANGE
  severity VARCHAR(32) DEFAULT 'MEDIUM', -- LOW | MEDIUM | HIGH | CRITICAL
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  ip_address VARCHAR(45),
  device_info VARCHAR(255),
  is_read BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_security_alerts_user ON user_security_alerts(user_id, is_read);

CREATE TABLE IF NOT EXISTS user_account_controls (
  control_id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  account_state VARCHAR(32) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | TEMPORARY_RESTRICTED | SUSPENDED | FROZEN | SELF_EXCLUDED | TIMEOUT | PERMANENT_CLOSED
  reason TEXT,
  category VARCHAR(64),
  operator_id VARCHAR(64),
  restricted_until TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_account_controls_user ON user_account_controls(user_id);

CREATE TABLE IF NOT EXISTS user_security_audit_logs (
  audit_id SERIAL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  actor_id VARCHAR(64) NOT NULL,
  action VARCHAR(64) NOT NULL,
  ip_address VARCHAR(45),
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_security_audit_user ON user_security_audit_logs(user_id);
