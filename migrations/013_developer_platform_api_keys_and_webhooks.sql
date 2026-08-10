-- Migration 013: Developer Platform, Public API, API Keys & Webhook Ecosystem

-- 1. DEVELOPER APPLICATIONS TABLE
CREATE TABLE IF NOT EXISTS developer_apps (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  tenant_id VARCHAR(64) DEFAULT 'tenant_default',
  name VARCHAR(128) NOT NULL,
  description TEXT,
  environment VARCHAR(32) DEFAULT 'PRODUCTION', -- TEST | PRODUCTION
  status VARCHAR(32) DEFAULT 'ACTIVE', -- ACTIVE | SUSPENDED | REVOKED
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. API KEYS TABLE (Cryptographic SHA-256 Hashes)
CREATE TABLE IF NOT EXISTS api_keys (
  id VARCHAR(64) PRIMARY KEY,
  app_id VARCHAR(64) NOT NULL REFERENCES developer_apps(id) ON DELETE CASCADE,
  tenant_id VARCHAR(64) DEFAULT 'tenant_default',
  key_prefix VARCHAR(16) NOT NULL,
  key_hash VARCHAR(255) NOT NULL UNIQUE,
  scopes TEXT[] NOT NULL,
  environment VARCHAR(32) DEFAULT 'PRODUCTION',
  status VARCHAR(32) DEFAULT 'ACTIVE', -- ACTIVE | ROTATING | REVOKED
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_app ON api_keys(app_id);

-- 3. WEBHOOK SUBSCRIPTIONS TABLE
CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id VARCHAR(64) PRIMARY KEY,
  app_id VARCHAR(64) NOT NULL REFERENCES developer_apps(id) ON DELETE CASCADE,
  tenant_id VARCHAR(64) DEFAULT 'tenant_default',
  target_url VARCHAR(255) NOT NULL,
  secret VARCHAR(255) NOT NULL,
  subscribed_events TEXT[] NOT NULL,
  status VARCHAR(32) DEFAULT 'ACTIVE', -- ACTIVE | DISABLED
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. WEBHOOK DELIVERIES TABLE
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id VARCHAR(64) PRIMARY KEY,
  subscription_id VARCHAR(64) NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
  event_type VARCHAR(64) NOT NULL,
  event_id VARCHAR(64) NOT NULL,
  payload TEXT NOT NULL,
  signature VARCHAR(255) NOT NULL,
  status VARCHAR(32) DEFAULT 'QUEUED', -- QUEUED | DELIVERED | FAILED | DEAD_LETTER
  attempts INT DEFAULT 0,
  response_code INT,
  response_time_ms INT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wh_deliveries_sub ON webhook_deliveries(subscription_id, status);
