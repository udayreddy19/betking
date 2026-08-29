-- Migration 104: User Web Push Subscriptions Architecture
CREATE TABLE IF NOT EXISTS user_push_subscriptions (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | INACTIVE | EXPIRED
  error_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_success_at TIMESTAMPTZ,
  CONSTRAINT unq_user_push_endpoint UNIQUE (user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_sub_user_status ON user_push_subscriptions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_push_sub_endpoint ON user_push_subscriptions(endpoint);
