-- Track daily-spin bonus/freebet credits with 24h use-by expiry.

ALTER TABLE daily_spins
  ADD COLUMN IF NOT EXISTS prize_expires_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS spin_wallet_grants (
  grant_id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  spin_id VARCHAR(64) NOT NULL REFERENCES daily_spins(spin_id) ON DELETE CASCADE,
  grant_type VARCHAR(16) NOT NULL CHECK (grant_type IN ('bonus', 'freebet')),
  original_amount NUMERIC(14,2) NOT NULL,
  remaining_amount NUMERIC(14,2) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  expired_at TIMESTAMPTZ,
  CONSTRAINT spin_wallet_grants_remaining_check CHECK (remaining_amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_spin_grants_user_active
  ON spin_wallet_grants(user_id, status, expires_at);
