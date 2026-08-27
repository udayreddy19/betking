-- 064: Invite-only signup promo codes + invite allowlist

ALTER TABLE signup_promo_codes
  ADD COLUMN IF NOT EXISTS is_invite_only BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS signup_promo_invites (
  invite_id VARCHAR(64) PRIMARY KEY,
  code_id VARCHAR(64) NOT NULL REFERENCES signup_promo_codes(code_id) ON DELETE CASCADE,
  email_normalized VARCHAR(255) NOT NULL,
  user_id VARCHAR(64) REFERENCES users(user_id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_by VARCHAR(64),
  provider_message_id VARCHAR(128),
  status VARCHAR(16) NOT NULL DEFAULT 'SENT'
    CHECK (status IN ('SENT', 'FAILED')),
  failure_reason TEXT,
  UNIQUE (code_id, email_normalized)
);

CREATE INDEX IF NOT EXISTS idx_signup_promo_invites_email
  ON signup_promo_invites (email_normalized);

CREATE INDEX IF NOT EXISTS idx_signup_promo_invites_code
  ON signup_promo_invites (code_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_signup_promo_codes_invite
  ON signup_promo_codes (is_invite_only, is_active);
