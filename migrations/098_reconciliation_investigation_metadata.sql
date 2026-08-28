/**
 * Migration 098 — reconciliation investigation metadata (additive, flag-only).
 * Does not mutate wallets or ledger history.
 */

ALTER TABLE reconciliation_cases
  ADD COLUMN IF NOT EXISTS mismatch_category VARCHAR(64);

ALTER TABLE reconciliation_cases
  ADD COLUMN IF NOT EXISTS suspected_cause TEXT;

ALTER TABLE reconciliation_cases
  ADD COLUMN IF NOT EXISTS investigation_status VARCHAR(64);

ALTER TABLE reconciliation_cases
  ADD COLUMN IF NOT EXISTS evidence JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE reconciliation_cases
  ADD COLUMN IF NOT EXISTS reviewer VARCHAR(64);

ALTER TABLE reconciliation_cases
  ADD COLUMN IF NOT EXISTS investigation_notes TEXT;

ALTER TABLE reconciliation_cases
  ADD COLUMN IF NOT EXISTS resolution_classification VARCHAR(64);

ALTER TABLE reconciliation_cases
  ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ;

ALTER TABLE reconciliation_cases
  ADD COLUMN IF NOT EXISTS linked_adjustment_id VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_recon_investigation_status
  ON reconciliation_cases (investigation_status)
  WHERE investigation_status IS NOT NULL;

COMMENT ON COLUMN reconciliation_cases.investigation_status IS
  'OPEN|INVESTIGATING|HISTORICAL_OPENING_BALANCE|BUCKET_METHODOLOGY|ACTIVE_TRANSACTION|DUPLICATE_OR_MISSING_ENTRY|ACCEPTED_WITH_EVIDENCE|RESOLVED_BY_APPROVED_ADJUSTMENT';

COMMENT ON COLUMN reconciliation_cases.resolution_classification IS
  'Never implies auto wallet repair; link approved maker/checker adjustment via linked_adjustment_id';
