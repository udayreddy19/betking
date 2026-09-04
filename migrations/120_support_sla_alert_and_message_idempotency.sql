-- Migration 120: Durable SLA alert dedupe + support message idempotency uniqueness
-- + notification metadata for support deep links

-- 1. SLA alert cooldown survives restart / multi-instance
CREATE TABLE IF NOT EXISTS support_sla_alert_log (
  conversation_id VARCHAR(64) NOT NULL,
  sla_status VARCHAR(32) NOT NULL,
  alerted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, sla_status)
);

CREATE INDEX IF NOT EXISTS idx_support_sla_alert_log_alerted
  ON support_sla_alert_log (alerted_at DESC);

-- 2. Cross-instance message idempotency (column already exists from 015)
ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128);

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_msg_conv_idempotency
  ON support_messages (conversation_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 3. Optional metadata for in-app deep links (ticket / conversation refs)
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
