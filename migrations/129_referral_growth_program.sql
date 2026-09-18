-- 129: Referral growth — clicks, milestones, campaign overlays, attribution expiry helpers

CREATE TABLE IF NOT EXISTS referral_clicks (
  id BIGSERIAL PRIMARY KEY,
  referral_code VARCHAR(32) NOT NULL,
  referrer_user_id VARCHAR(64),
  ip_hash VARCHAR(64),
  user_agent VARCHAR(512),
  landing_path VARCHAR(256),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_clicks_code_created
  ON referral_clicks (referral_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_clicks_referrer
  ON referral_clicks (referrer_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS referral_milestone_grants (
  id VARCHAR(64) PRIMARY KEY,
  referrer_user_id VARCHAR(64) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  milestone INT NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  reward_kind VARCHAR(16) NOT NULL DEFAULT 'freebet',
  transaction_id VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unq_referral_milestone UNIQUE (referrer_user_id, milestone)
);

CREATE INDEX IF NOT EXISTS idx_referral_milestone_referrer
  ON referral_milestone_grants (referrer_user_id);

ALTER TABLE referrals
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_bet_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS qualified_deposit_total NUMERIC(14,2) DEFAULT 0;

-- Default expiry for pending attributions (30 days) when column empty
UPDATE referrals
SET expires_at = created_at + INTERVAL '30 days'
WHERE expires_at IS NULL
  AND status IN ('REGISTERED', 'FRAUD_REVIEW')
  AND qualification_status IS DISTINCT FROM 'QUALIFIED'
  AND reward_status IS DISTINCT FROM 'GRANTED';
