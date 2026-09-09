-- =============================================================================
-- Migration 127: Admin WhatsApp Messaging Logs (Kapso WhatsApp Business API)
-- Tracks outbound WhatsApp messages, templates, recipients, delivery status, and Kapso IDs
-- =============================================================================

CREATE TABLE IF NOT EXISTS admin_whatsapp_logs (
  id VARCHAR(64) PRIMARY KEY,
  admin_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64),
  recipient_phone VARCHAR(32) NOT NULL,
  message_type VARCHAR(32) NOT NULL DEFAULT 'TEXT', -- 'TEXT', 'TEMPLATE'
  template_name VARCHAR(128),
  message_body TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'SENT', -- 'SENT', 'DELIVERED', 'READ', 'FAILED', 'MOCK_SENT'
  kapso_message_id VARCHAR(128),
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_whatsapp_logs_created_at ON admin_whatsapp_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_whatsapp_logs_recipient_phone ON admin_whatsapp_logs(recipient_phone);
CREATE INDEX IF NOT EXISTS idx_admin_whatsapp_logs_user_id ON admin_whatsapp_logs(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_admin_whatsapp_logs_status ON admin_whatsapp_logs(status);
CREATE INDEX IF NOT EXISTS idx_admin_whatsapp_logs_admin_id ON admin_whatsapp_logs(admin_id);
