-- Per-user claim cap for signup promo codes.
-- NULL max_per_user = unlimited for that account (still subject to total max_redemptions).

ALTER TABLE signup_promo_codes
  ADD COLUMN IF NOT EXISTS max_per_user INTEGER
    CHECK (max_per_user IS NULL OR max_per_user > 0);

UPDATE signup_promo_codes
SET max_per_user = 1
WHERE max_per_user IS NULL;

ALTER TABLE signup_promo_codes
  ALTER COLUMN max_per_user SET DEFAULT 1;

ALTER TABLE signup_promo_redemptions
  DROP CONSTRAINT IF EXISTS signup_promo_redemptions_user_id_key;

CREATE INDEX IF NOT EXISTS idx_signup_promo_redemptions_user_code
  ON signup_promo_redemptions(user_id, code_id);
