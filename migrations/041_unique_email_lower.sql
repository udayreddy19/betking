-- Email uniqueness is case-insensitive (signup already lowercases; this closes mixed-case races).

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower
  ON users (lower(email))
  WHERE email IS NOT NULL
    AND btrim(email) <> '';
