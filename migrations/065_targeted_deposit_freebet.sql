-- 065: Targeted deposit free-bet campaigns (extends promotions + user assignment)
-- Reuses deposit_freebet_grants / freebet_balance / promos@oddsyra.com email path.

ALTER TABLE promotions
  ADD COLUMN IF NOT EXISTS is_targeted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS email_subject VARCHAR(255),
  ADD COLUMN IF NOT EXISTS email_body TEXT;

CREATE TABLE IF NOT EXISTS deposit_freebet_campaign_users (
  assignment_id VARCHAR(64) PRIMARY KEY,
  promotion_id VARCHAR(64) NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  user_id VARCHAR(64) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by VARCHAR(64),
  offer_email_status VARCHAR(16) NOT NULL DEFAULT 'NONE'
    CHECK (offer_email_status IN ('NONE', 'QUEUED', 'SENT', 'FAILED')),
  offer_email_sent_at TIMESTAMPTZ,
  offer_email_message_id VARCHAR(128),
  offer_email_error TEXT,
  UNIQUE (promotion_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_dfb_campaign_users_user
  ON deposit_freebet_campaign_users (user_id);

CREATE INDEX IF NOT EXISTS idx_dfb_campaign_users_promo
  ON deposit_freebet_campaign_users (promotion_id, assigned_at DESC);

CREATE INDEX IF NOT EXISTS idx_promotions_targeted_active
  ON promotions (is_targeted, status, auto_grant_on_deposit)
  WHERE COALESCE(reward_bucket, 'bonus') = 'freebet';
