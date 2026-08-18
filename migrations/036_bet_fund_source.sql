-- Persist which wallet bucket funded a bet (cash | bonus | freebet).

ALTER TABLE bets
  ADD COLUMN IF NOT EXISTS fund_source VARCHAR(16) NOT NULL DEFAULT 'cash';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bets_fund_source_check'
  ) THEN
    ALTER TABLE bets ADD CONSTRAINT bets_fund_source_check
      CHECK (fund_source IN ('cash', 'bonus', 'freebet'));
  END IF;
END $$;
