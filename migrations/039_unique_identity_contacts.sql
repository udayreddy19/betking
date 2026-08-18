-- One account per email, phone, PAN, and Aadhaar.

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_last10
  ON users ((right(regexp_replace(phone, '[^0-9]', '', 'g'), 10)))
  WHERE phone IS NOT NULL
    AND btrim(phone) <> ''
    AND length(regexp_replace(phone, '[^0-9]', '', 'g')) >= 10;

DROP INDEX IF EXISTS idx_kyc_verified_pan;
DROP INDEX IF EXISTS idx_kyc_verified_aadhaar;

CREATE UNIQUE INDEX IF NOT EXISTS idx_kyc_pan_linked
  ON kyc_cases (upper(btrim(pan_number)))
  WHERE pan_number IS NOT NULL
    AND btrim(pan_number) <> ''
    AND status IN ('UNDER_REVIEW', 'VERIFIED', 'PENDING', 'NOT_STARTED', 'VERIFICATION_REQUIRED');

CREATE UNIQUE INDEX IF NOT EXISTS idx_kyc_aadhaar_linked
  ON kyc_cases (regexp_replace(aadhaar_number, '[^0-9]', '', 'g'))
  WHERE aadhaar_number IS NOT NULL
    AND btrim(aadhaar_number) <> ''
    AND status IN ('UNDER_REVIEW', 'VERIFIED', 'PENDING', 'NOT_STARTED', 'VERIFICATION_REQUIRED');
