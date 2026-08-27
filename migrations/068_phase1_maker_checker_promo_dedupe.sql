-- 068: Phase 1 hardening — withdrawal maker/checker + promo abuse dedupe
-- Additive only; does not change wallet/ledger semantics.

ALTER TABLE withdrawals
  ADD COLUMN IF NOT EXISTS maker_admin_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS maker_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checker_admin_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS checker_approved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_withdrawals_pending_checker
  ON withdrawals (status)
  WHERE UPPER(status) = 'PENDING_CHECKER';

ALTER TABLE promo_abuse_alerts
  ADD COLUMN IF NOT EXISTS event_key VARCHAR(160);

CREATE UNIQUE INDEX IF NOT EXISTS uq_promo_abuse_alerts_event_open
  ON promo_abuse_alerts (event_key)
  WHERE event_key IS NOT NULL AND status = 'OPEN';
