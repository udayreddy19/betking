-- Migration 116: Bonus 5x Wagering Ledger and Locked Winnings Escrow Bucket
-- Enforces:
-- 1. Distinct locked_bonus_winnings column in wallets table.
-- 2. Locked & released winnings tracking on user_bonuses table.
-- 3. Dedicated bonus_wagering_ledger table with unique idempotency constraint.

ALTER TABLE wallets
  ADD COLUMN IF NOT EXISTS locked_bonus_winnings NUMERIC(14,2) NOT NULL DEFAULT 0.00;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_locked_bonus_winnings_non_negative'
  ) THEN
    ALTER TABLE wallets
      ADD CONSTRAINT check_locked_bonus_winnings_non_negative
      CHECK (locked_bonus_winnings >= 0.00);
  END IF;
END $$;

ALTER TABLE user_bonuses
  ADD COLUMN IF NOT EXISTS locked_winnings NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS released_winnings NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS bonus_wagering_ledger (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  bonus_id VARCHAR(64) NOT NULL REFERENCES user_bonuses(id) ON DELETE CASCADE,
  bet_id VARCHAR(64) NOT NULL REFERENCES bets(bet_id) ON DELETE CASCADE,
  stake_amount NUMERIC(14,2) NOT NULL,
  qualifying_amount NUMERIC(14,2) NOT NULL,
  minimum_odds NUMERIC(6,2) NOT NULL DEFAULT 1.75,
  actual_odds NUMERIC(6,2) NOT NULL,
  result VARCHAR(16) NOT NULL, -- WON | LOST | VOID | CANCELLED
  turnover_before NUMERIC(14,2) NOT NULL,
  turnover_after NUMERIC(14,2) NOT NULL,
  remaining_before NUMERIC(14,2) NOT NULL,
  remaining_after NUMERIC(14,2) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'APPLIED', -- APPLIED | REVERSED | REJECTED_ODDS | VOID_NO_TURNOVER
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bonus_wagering_bet_settlement
  ON bonus_wagering_ledger(bonus_id, bet_id, result);

CREATE INDEX IF NOT EXISTS idx_bonus_wagering_user
  ON bonus_wagering_ledger(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bonus_wagering_bonus_id
  ON bonus_wagering_ledger(bonus_id);
