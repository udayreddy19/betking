-- Audit trail for loyalty earn / redeem / admin adjustments.
CREATE TABLE IF NOT EXISTS loyalty_ledger (
  id BIGSERIAL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(user_id),
  entry_type VARCHAR(32) NOT NULL,
  points_delta NUMERIC(14,2) NOT NULL,
  points_after NUMERIC(14,2) NOT NULL,
  vip_points_after NUMERIC(14,2) NOT NULL,
  source VARCHAR(64),
  reference_id VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_user_created
  ON loyalty_ledger (user_id, created_at DESC);
