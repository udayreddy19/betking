-- 061: User referral codes, reward events, and extended referral columns
-- Extends existing `referrals` table from 010 — does not replace it.

CREATE TABLE IF NOT EXISTS referral_codes (
  code VARCHAR(32) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'DISABLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_codes_user ON referral_codes (user_id);

ALTER TABLE referrals
  ADD COLUMN IF NOT EXISTS referred_reward_amount NUMERIC(14,2) DEFAULT 500.00,
  ADD COLUMN IF NOT EXISTS referrer_reward_amount NUMERIC(14,2) DEFAULT 500.00,
  ADD COLUMN IF NOT EXISTS qualified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rewarded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attribution_status VARCHAR(32) DEFAULT 'ATTRIBUTED',
  ADD COLUMN IF NOT EXISTS qualification_status VARCHAR(32) DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS reward_status VARCHAR(32) DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill extended columns from legacy status where needed
UPDATE referrals
SET attribution_status = COALESCE(NULLIF(attribution_status, ''), 'ATTRIBUTED'),
    qualification_status = CASE
      WHEN status IN ('QUALIFIED', 'REWARDED') THEN 'QUALIFIED'
      WHEN status IN ('REJECTED') THEN 'FAILED'
      WHEN status = 'FRAUD_REVIEW' THEN 'PENDING'
      ELSE COALESCE(NULLIF(qualification_status, ''), 'PENDING')
    END,
    reward_status = CASE
      WHEN status = 'REWARDED' THEN 'GRANTED'
      WHEN status = 'REJECTED' THEN 'FAILED'
      ELSE COALESCE(NULLIF(reward_status, ''), 'PENDING')
    END
WHERE TRUE;

CREATE TABLE IF NOT EXISTS referral_reward_events (
  id VARCHAR(64) PRIMARY KEY,
  referral_id VARCHAR(64) NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
  beneficiary_user_id VARCHAR(64) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  reward_type VARCHAR(32) NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  transaction_id VARCHAR(64),
  status VARCHAR(32) NOT NULL DEFAULT 'GRANTED'
    CHECK (status IN ('GRANTED', 'FAILED', 'REVERSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unq_referral_reward_idempotency UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_referral_reward_events_referral
  ON referral_reward_events (referral_id);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer_status
  ON referrals (referrer_user_id, status);

CREATE INDEX IF NOT EXISTS idx_referrals_code
  ON referrals (referral_code);
