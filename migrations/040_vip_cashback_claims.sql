-- Daily VIP cashback claims (one per user per IST day of losses).

CREATE TABLE IF NOT EXISTS vip_cashback_claims (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(user_id),
  claim_date DATE NOT NULL,
  net_loss NUMERIC(14,2) NOT NULL DEFAULT 0,
  cashback_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, claim_date)
);

CREATE INDEX IF NOT EXISTS idx_vip_cashback_user ON vip_cashback_claims(user_id);
