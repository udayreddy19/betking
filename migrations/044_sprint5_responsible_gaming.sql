-- Sprint 5: weekly loss limits, reality-check acks, KYC date of birth

ALTER TABLE responsible_gaming_limits
  ADD COLUMN IF NOT EXISTS loss_limit_weekly NUMERIC(12, 2) DEFAULT 100000.00,
  ADD COLUMN IF NOT EXISTS last_reality_check_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS session_started_at TIMESTAMP WITH TIME ZONE;

CREATE TABLE IF NOT EXISTS reality_check_acks (
  id BIGSERIAL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  acked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  interval_mins INT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reality_check_acks_user_time
  ON reality_check_acks (user_id, acked_at DESC);

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS date_of_birth DATE;
