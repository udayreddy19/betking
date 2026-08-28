/**
 * Migration 097 — append-only audit_events + finance daily closing (flag-only).
 * Additive only. Does not mutate wallets/ledger history.
 */

-- Prevent UPDATE/DELETE on audit_events (append-only)
CREATE OR REPLACE FUNCTION prevent_audit_events_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_events_no_update ON audit_events;
CREATE TRIGGER trg_audit_events_no_update
  BEFORE UPDATE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_events_mutation();

DROP TRIGGER IF EXISTS trg_audit_events_no_delete ON audit_events;
CREATE TRIGGER trg_audit_events_no_delete
  BEFORE DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_events_mutation();

-- Enrich audit rows when columns missing (additive)
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45);
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS request_id VARCHAR(128);
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS risk_level VARCHAR(16);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_request ON audit_events(request_id) WHERE request_id IS NOT NULL;

-- Daily finance closing pack (sign-off metadata only; no balance mutation)
CREATE TABLE IF NOT EXISTS finance_daily_closings (
  closing_id VARCHAR(64) PRIMARY KEY,
  closing_date DATE NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'OPEN', -- OPEN | IN_REVIEW | SIGNED_OFF | REOPENED
  opening_wallet_total NUMERIC(18,2),
  closing_wallet_total NUMERIC(18,2),
  deposits_total NUMERIC(18,2),
  withdrawals_total NUMERIC(18,2),
  bet_stakes_total NUMERIC(18,2),
  bet_payouts_total NUMERIC(18,2),
  freebet_total NUMERIC(18,2),
  bonus_total NUMERIC(18,2),
  ledger_net NUMERIC(18,2),
  expected_closing NUMERIC(18,2),
  actual_closing NUMERIC(18,2),
  difference NUMERIC(18,2),
  recon_status VARCHAR(32),
  signed_off_by VARCHAR(64),
  signed_off_at TIMESTAMPTZ,
  reopen_reason TEXT,
  notes TEXT,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_daily_closings_date
  ON finance_daily_closings(closing_date);

CREATE INDEX IF NOT EXISTS idx_finance_daily_closings_status
  ON finance_daily_closings(status);
