-- Monthly club credits and one-time tier-up rewards.

CREATE TABLE IF NOT EXISTS vip_perk_claims (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(user_id),
  perk_kind VARCHAR(32) NOT NULL,
  perk_key VARCHAR(64) NOT NULL,
  reward_type VARCHAR(16) NOT NULL,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, perk_kind, perk_key)
);

CREATE INDEX IF NOT EXISTS idx_vip_perk_user ON vip_perk_claims(user_id);
