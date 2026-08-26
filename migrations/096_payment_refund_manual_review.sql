-- Allow MANUAL_REVIEW_REQUIRED for refunds when wallet cannot safely reverse funds.
ALTER TABLE payment_refunds DROP CONSTRAINT IF EXISTS payment_refunds_status_check;
ALTER TABLE payment_refunds
  ADD CONSTRAINT payment_refunds_status_check
  CHECK (status IN ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'MANUAL_REVIEW_REQUIRED'));

ALTER TABLE payment_refunds ADD COLUMN IF NOT EXISTS review_notes TEXT;
ALTER TABLE payment_refunds ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE payment_refunds ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(64);
