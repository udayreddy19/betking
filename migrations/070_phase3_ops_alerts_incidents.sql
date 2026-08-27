-- 070: Phase 3 Operations — extend admin_notifications + incidents (additive)
-- Reuses admin_notifications as the ops alert store; extends incidents lifecycle.
-- Does not create a parallel financial engine.

ALTER TABLE admin_notifications
  ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'OPEN',
  ADD COLUMN IF NOT EXISTS severity VARCHAR(16) DEFAULT 'WARNING',
  ADD COLUMN IF NOT EXISTS dedupe_key VARCHAR(160),
  ADD COLUMN IF NOT EXISTS occurrence_count INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS source VARCHAR(64),
  ADD COLUMN IF NOT EXISTS entity_type VARCHAR(64),
  ADD COLUMN IF NOT EXISTS entity_id VARCHAR(128),
  ADD COLUMN IF NOT EXISTS acknowledged_by VARCHAR(64),
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_by VARCHAR(64),
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_occurrence_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS action_note TEXT;

CREATE INDEX IF NOT EXISTS idx_admin_notif_status_sev
  ON admin_notifications (status, severity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_notif_dedupe_open
  ON admin_notifications (dedupe_key)
  WHERE dedupe_key IS NOT NULL AND UPPER(COALESCE(status,'OPEN')) = 'OPEN';

CREATE INDEX IF NOT EXISTS idx_admin_notif_entity
  ON admin_notifications (entity_type, entity_id)
  WHERE entity_id IS NOT NULL;

ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS category VARCHAR(64) DEFAULT 'SYSTEM',
  ADD COLUMN IF NOT EXISTS created_by VARCHAR(64),
  ADD COLUMN IF NOT EXISTS assigned_to VARCHAR(64),
  ADD COLUMN IF NOT EXISTS resolution_summary TEXT,
  ADD COLUMN IF NOT EXISTS related_alert_ids JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS related_entity_type VARCHAR(64),
  ADD COLUMN IF NOT EXISTS related_entity_id VARCHAR(128),
  ADD COLUMN IF NOT EXISTS incident_number VARCHAR(32),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS uq_incidents_number
  ON incidents (incident_number)
  WHERE incident_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS incident_timeline (
  id VARCHAR(64) PRIMARY KEY,
  incident_id VARCHAR(64) NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  event_type VARCHAR(64) NOT NULL,
  actor_id VARCHAR(64),
  note TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_incident_timeline_inc
  ON incident_timeline (incident_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ops_alert_rules (
  rule_id VARCHAR(64) PRIMARY KEY,
  rule_key VARCHAR(64) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  category VARCHAR(64) NOT NULL DEFAULT 'SYSTEM',
  severity VARCHAR(16) NOT NULL DEFAULT 'WARNING',
  threshold_count INT NOT NULL DEFAULT 10,
  window_seconds INT NOT NULL DEFAULT 300,
  cooldown_seconds INT NOT NULL DEFAULT 600,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  channels JSONB NOT NULL DEFAULT '["IN_APP"]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO ops_alert_rules (rule_id, rule_key, title, category, severity, threshold_count, window_seconds, cooldown_seconds)
VALUES
  ('oar_wd_fail', 'WITHDRAWAL_FAILURE_SPIKE', 'Withdrawal failure spike', 'FINANCIAL', 'HIGH', 10, 300, 600),
  ('oar_wd_high', 'WITHDRAWAL_HIGH_RISK_CLUSTER', 'Multiple HIGH/CRITICAL withdrawals', 'FINANCIAL', 'HIGH', 5, 900, 900),
  ('oar_recon', 'RECONCILIATION_DISCREPANCY', 'Open reconciliation discrepancy', 'FINANCIAL', 'CRITICAL', 1, 60, 1800),
  ('oar_settle', 'SETTLEMENT_FAILURE_SPIKE', 'Settlement failure spike', 'BETTING', 'CRITICAL', 5, 300, 600),
  ('oar_odds', 'ODDS_FRESHNESS_FAILURE', 'Odds freshness / feed degradation', 'BETTING', 'WARNING', 3, 300, 600),
  ('oar_promo', 'PROMO_ABUSE_SPIKE', 'Promotion abuse spike', 'PROMOTION', 'WARNING', 20, 600, 900),
  ('oar_db', 'DATABASE_HEALTH', 'Database health degraded', 'SYSTEM', 'CRITICAL', 1, 60, 300),
  ('oar_outbox', 'OUTBOX_BACKLOG', 'Outbox backlog elevated', 'SYSTEM', 'HIGH', 100, 300, 600)
ON CONFLICT (rule_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS ops_notification_preferences (
  admin_id VARCHAR(64) PRIMARY KEY,
  critical_alerts BOOLEAN DEFAULT TRUE,
  high_alerts BOOLEAN DEFAULT TRUE,
  financial_alerts BOOLEAN DEFAULT TRUE,
  security_alerts BOOLEAN DEFAULT TRUE,
  betting_alerts BOOLEAN DEFAULT TRUE,
  promotion_alerts BOOLEAN DEFAULT TRUE,
  system_alerts BOOLEAN DEFAULT TRUE,
  channel_in_app BOOLEAN DEFAULT TRUE,
  channel_email BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
