-- Sequential counter for human-readable user IDs (firstname_DD_MM_YYYY_000001).
-- Existing user_id values are left unchanged; new signups consume this sequence.

CREATE SEQUENCE IF NOT EXISTS user_id_seq START WITH 1 INCREMENT BY 1;

DO $$
DECLARE
  n bigint;
BEGIN
  SELECT COUNT(*) INTO n FROM users;
  IF n > 0 THEN
    PERFORM setval('user_id_seq', n, true);
  END IF;
END $$;
