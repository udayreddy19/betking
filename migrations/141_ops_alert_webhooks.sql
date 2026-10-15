-- Persist outgoing ops alert webhooks (Slack/Discord/Telegram/generic).
CREATE TABLE IF NOT EXISTS ops_alert_webhooks (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  type VARCHAR(32) NOT NULL DEFAULT 'SLACK',
  url TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  min_priority VARCHAR(16) NOT NULL DEFAULT 'HIGH',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ops_alert_webhooks_enabled ON ops_alert_webhooks (enabled);