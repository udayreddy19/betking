-- 063: Deposit → Free Bet promotion (extends promotions + grant ledger)
-- Reuses wallets.freebet_balance; does NOT invent a parallel wallet.

ALTER TABLE promotions
  ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reward_bucket VARCHAR(16) DEFAULT 'bonus',
  ADD COLUMN IF NOT EXISTS auto_grant_on_deposit BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS eligibility VARCHAR(16) DEFAULT 'ALL',
  ADD COLUMN IF NOT EXISTS email_on_grant BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS freebet_expiry_days INT DEFAULT 7,
  ADD COLUMN IF NOT EXISTS max_eligible_deposit NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'promotions_reward_bucket_check'
  ) THEN
    ALTER TABLE promotions
      ADD CONSTRAINT promotions_reward_bucket_check
      CHECK (reward_bucket IS NULL OR reward_bucket IN ('bonus', 'freebet', 'cash'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'promotions_eligibility_check'
  ) THEN
    ALTER TABLE promotions
      ADD CONSTRAINT promotions_eligibility_check
      CHECK (eligibility IS NULL OR eligibility IN ('NEW', 'EXISTING', 'ALL'));
  END IF;
END $$;

-- Grant / reward ledger for deposit-match free bets (idempotent per deposit + per user+promo)
CREATE TABLE IF NOT EXISTS deposit_freebet_grants (
  grant_id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  promotion_id VARCHAR(64) NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  deposit_id VARCHAR(64) NOT NULL,
  deposit_amount NUMERIC(14,2) NOT NULL,
  freebet_amount NUMERIC(14,2) NOT NULL,
  remaining_amount NUMERIC(14,2) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'AVAILABLE'
    CHECK (status IN ('AVAILABLE', 'USED', 'EXPIRED', 'REVOKED')),
  email_status VARCHAR(16) NOT NULL DEFAULT 'NONE'
    CHECK (email_status IN ('NONE', 'SENT', 'FAILED', 'RETRY')),
  email_sent_at TIMESTAMPTZ,
  email_message_id VARCHAR(128),
  email_error TEXT,
  email_admin_id VARCHAR(64),
  skip_reason VARCHAR(64),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT deposit_freebet_grants_remaining_check CHECK (remaining_amount >= 0),
  CONSTRAINT deposit_freebet_grants_deposit_unique UNIQUE (deposit_id)
);

CREATE INDEX IF NOT EXISTS idx_deposit_freebet_grants_user
  ON deposit_freebet_grants (user_id, status);

CREATE INDEX IF NOT EXISTS idx_deposit_freebet_grants_user_promo
  ON deposit_freebet_grants (user_id, promotion_id);

CREATE INDEX IF NOT EXISTS idx_deposit_freebet_grants_promo
  ON deposit_freebet_grants (promotion_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_deposit_freebet_grants_email
  ON deposit_freebet_grants (email_status, created_at DESC);

CREATE TABLE IF NOT EXISTS deposit_freebet_email_log (
  log_id VARCHAR(64) PRIMARY KEY,
  grant_id VARCHAR(64) NOT NULL REFERENCES deposit_freebet_grants(grant_id) ON DELETE CASCADE,
  user_id VARCHAR(64) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  promotion_id VARCHAR(64) NOT NULL,
  email_to VARCHAR(255),
  template VARCHAR(64) NOT NULL DEFAULT 'deposit_freebet_ready',
  status VARCHAR(16) NOT NULL CHECK (status IN ('SENT', 'FAILED', 'RETRY')),
  provider_message_id VARCHAR(128),
  failure_reason TEXT,
  admin_id VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deposit_freebet_email_log_grant
  ON deposit_freebet_email_log (grant_id, created_at DESC);

-- Seed default campaign (OFF until Admin enables). Idempotent upsert by code.
INSERT INTO promotions (
  id, name, code, type, status,
  budget, used_budget, max_reward, per_user_limit,
  min_odds, min_stake, wagering_multiplier, match_percent, expires_at,
  starts_at, reward_bucket, auto_grant_on_deposit, eligibility,
  email_on_grant, freebet_expiry_days, max_eligible_deposit, updated_at
) VALUES (
  'promo_deposit_match_freebet',
  'Deposit 100% Free Bet',
  'DEPOSIT_MATCH_FREEBET',
  'FREE_BET',
  'PAUSED',
  10000000.00,
  0.00,
  10000.00,
  1,
  1.00,
  10000.00,
  0.00,
  100.00,
  NULL,
  NULL,
  'freebet',
  true,
  'ALL',
  true,
  7,
  10000.00,
  NOW()
)
ON CONFLICT (code) DO UPDATE SET
  type = EXCLUDED.type,
  reward_bucket = EXCLUDED.reward_bucket,
  auto_grant_on_deposit = EXCLUDED.auto_grant_on_deposit,
  updated_at = NOW();
