-- Migration 045: Google OAuth identity linking

ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub
  ON users (google_sub)
  WHERE google_sub IS NOT NULL;
