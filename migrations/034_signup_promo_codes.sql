-- Signup promotional codes (admin-managed). Active codes can be entered at registration.

CREATE TABLE IF NOT EXISTS signup_promo_codes (
  code_id VARCHAR(64) PRIMARY KEY,
  code VARCHAR(32) UNIQUE NOT NULL,
  name VARCHAR(128) NOT NULL,
  reward_type VARCHAR(16) NOT NULL CHECK (reward_type IN ('bonus', 'freebet', 'cash')),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  max_redemptions INTEGER CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  redemption_count INTEGER NOT NULL DEFAULT 0,
  created_by VARCHAR(64),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS signup_promo_redemptions (
  redemption_id VARCHAR(64) PRIMARY KEY,
  code_id VARCHAR(64) NOT NULL REFERENCES signup_promo_codes(code_id) ON DELETE CASCADE,
  user_id VARCHAR(64) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  reward_type VARCHAR(16) NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_signup_promo_codes_active ON signup_promo_codes(is_active, code);
CREATE INDEX IF NOT EXISTS idx_signup_promo_redemptions_code ON signup_promo_redemptions(code_id);
