-- Promo identity (Aadhaar/PAN hashes), one claim per user, bonus 5x @ 1.75+.

ALTER TABLE signup_promo_redemptions
  ADD COLUMN IF NOT EXISTS pan_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS aadhaar_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE user_bonuses
  ADD COLUMN IF NOT EXISTS pan_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS aadhaar_hash VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS idx_signup_promo_once_per_user
  ON signup_promo_redemptions (user_id, code_id)
  WHERE revoked_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_signup_promo_once_per_pan
  ON signup_promo_redemptions (code_id, pan_hash)
  WHERE pan_hash IS NOT NULL AND revoked_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_signup_promo_once_per_aadhaar
  ON signup_promo_redemptions (code_id, aadhaar_hash)
  WHERE aadhaar_hash IS NOT NULL AND revoked_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_bonus_once_per_user
  ON user_bonuses (user_id, promotion_id)
  WHERE status IN ('ACTIVE', 'COMPLETED', 'RELEASED');

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_bonus_once_per_pan
  ON user_bonuses (promotion_id, pan_hash)
  WHERE pan_hash IS NOT NULL AND status IN ('ACTIVE', 'COMPLETED', 'RELEASED');

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_bonus_once_per_aadhaar
  ON user_bonuses (promotion_id, aadhaar_hash)
  WHERE aadhaar_hash IS NOT NULL AND status IN ('ACTIVE', 'COMPLETED', 'RELEASED');

CREATE UNIQUE INDEX IF NOT EXISTS idx_kyc_verified_pan
  ON kyc_cases (pan_number)
  WHERE status = 'VERIFIED' AND pan_number IS NOT NULL AND pan_number <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_kyc_verified_aadhaar
  ON kyc_cases (aadhaar_number)
  WHERE status = 'VERIFIED' AND aadhaar_number IS NOT NULL AND aadhaar_number <> '';

UPDATE promotions
SET min_odds = 1.75,
    wagering_multiplier = 5.0,
    per_user_limit = 1
WHERE code IN ('WELCOME150', 'RELOAD50', 'CRICKET25');

UPDATE signup_promo_codes
SET max_per_user = 1
WHERE code IN ('SPORTS500', 'LIVE100', 'VIP1000');
