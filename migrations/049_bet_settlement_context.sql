-- Migration 049: Persist settlement context on bets for authoritative re-grading.

ALTER TABLE bets ADD COLUMN IF NOT EXISTS placement_snapshot JSONB;
ALTER TABLE bets ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;
ALTER TABLE bets ADD COLUMN IF NOT EXISTS actual_payout NUMERIC(14,2);
ALTER TABLE bets ADD COLUMN IF NOT EXISTS settlement_reason TEXT;
ALTER TABLE bets ADD COLUMN IF NOT EXISTS settlement_version INT DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_bets_match_market_status
  ON bets (match_id, market_id, status);

CREATE INDEX IF NOT EXISTS idx_bets_user_status_created
  ON bets (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bet_selections_bet_status
  ON bet_selections (bet_id, status);
