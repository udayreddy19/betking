-- 062: Backfill referral codes for existing ACTIVE users (pre-referral-program accounts)

DO $$
DECLARE
  r RECORD;
  candidate TEXT;
  prefix TEXT;
  tries INT;
BEGIN
  FOR r IN
    SELECT u.user_id, u.first_name
    FROM users u
    WHERE UPPER(COALESCE(u.status, 'ACTIVE')) = 'ACTIVE'
      AND NOT EXISTS (SELECT 1 FROM referral_codes rc WHERE rc.user_id = u.user_id)
  LOOP
    prefix := UPPER(
      COALESCE(
        NULLIF(REGEXP_REPLACE(LEFT(COALESCE(r.first_name, 'USR'), 4), '[^A-Za-z]', '', 'g'), ''),
        'USR'
      )
    );
    tries := 0;
    LOOP
      tries := tries + 1;
      candidate := LEFT(
        prefix || SUBSTRING(UPPER(MD5(r.user_id || ':' || tries::text || ':' || clock_timestamp()::text)), 1, 8),
        12
      );
      BEGIN
        INSERT INTO referral_codes (code, user_id, status, created_at, updated_at)
        VALUES (candidate, r.user_id, 'ACTIVE', NOW(), NOW());
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        IF tries >= 10 THEN
          RAISE WARNING 'referral backfill: could not allocate code for user %', r.user_id;
          EXIT;
        END IF;
      END;
    END LOOP;
  END LOOP;
END $$;
