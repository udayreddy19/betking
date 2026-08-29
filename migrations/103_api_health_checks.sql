-- 103: API Explorer health history
-- Stores safe connectivity checks. Never store secrets, tokens, or KYC payloads.

CREATE TABLE IF NOT EXISTS api_health_checks (
  id BIGSERIAL PRIMARY KEY,
  api_id VARCHAR(128) NOT NULL,
  provider VARCHAR(128),
  category VARCHAR(64),
  success BOOLEAN NOT NULL DEFAULT FALSE,
  status_code INT,
  response_time_ms INT,
  error_code VARCHAR(64),
  error_message TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_health_checks_api_checked
  ON api_health_checks (api_id, checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_api_health_checks_checked
  ON api_health_checks (checked_at DESC);
