-- Migration 011: Unified Notification, Communication & User Engagement Center

-- 1. NOTIFICATION TEMPLATES TABLE
CREATE TABLE IF NOT EXISTS notification_templates (
  id VARCHAR(64) PRIMARY KEY,
  event_type VARCHAR(64) NOT NULL,
  channel VARCHAR(32) NOT NULL, -- EMAIL | SMS | PUSH | IN_APP
  subject VARCHAR(255),
  body_template TEXT NOT NULL,
  version INT DEFAULT 1,
  status VARCHAR(32) DEFAULT 'ACTIVE', -- DRAFT | APPROVED | ACTIVE
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unq_event_channel_ver UNIQUE(event_type, channel, version)
);

-- 2. NOTIFICATIONS DELIVERY QUEUE TABLE
CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  event_type VARCHAR(64) NOT NULL,
  category VARCHAR(32) NOT NULL, -- TRANSACTIONAL | SECURITY | BETTING | PAYMENT | KYC | PROMOTIONAL | SYSTEM
  channel VARCHAR(32) NOT NULL,
  recipient VARCHAR(128),
  subject VARCHAR(255),
  body TEXT NOT NULL,
  status VARCHAR(32) DEFAULT 'QUEUED', -- QUEUED | PROCESSING | SENT | DELIVERED | FAILED | DEAD_LETTER
  attempts INT DEFAULT 0,
  error_message TEXT,
  event_id VARCHAR(64),
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  delivered_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_notifications_queue ON notifications(status, attempts);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_event_unq ON notifications(event_id, event_type, user_id);

-- 3. USER NOTIFICATION PREFERENCES TABLE
CREATE TABLE IF NOT EXISTS user_notification_preferences (
  user_id VARCHAR(64) PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  marketing_email BOOLEAN DEFAULT TRUE,
  marketing_sms BOOLEAN DEFAULT TRUE,
  marketing_push BOOLEAN DEFAULT TRUE,
  transactional_email BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
