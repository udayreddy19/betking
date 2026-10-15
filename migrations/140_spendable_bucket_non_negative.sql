-- Hard-stop spendable wallet buckets from going negative.
-- winnings_balance remains unconstrained (cumulative P&L; see 053/054).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_bonus_balance_non_negative'
  ) THEN
    ALTER TABLE wallets
      ADD CONSTRAINT check_bonus_balance_non_negative
      CHECK (bonus_balance >= 0.00);
  END IF;
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'check_bonus_balance_non_negative skipped — existing negatives must be repaired first';
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_freebet_balance_non_negative'
  ) THEN
    ALTER TABLE wallets
      ADD CONSTRAINT check_freebet_balance_non_negative
      CHECK (freebet_balance >= 0.00);
  END IF;
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'check_freebet_balance_non_negative skipped — existing negatives must be repaired first';
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_reserved_balance_non_negative_v2'
  ) THEN
    -- reserved already has check_reserved_balance_non_negative on many installs
    NULL;
  END IF;
END $$;

COMMENT ON COLUMN wallets.bonus_balance IS 'Spendable promo bonus; must stay >= 0';
COMMENT ON COLUMN wallets.freebet_balance IS 'Spendable freebet bucket; must stay >= 0';
COMMENT ON COLUMN wallets.winnings_balance IS 'Cumulative lifetime net P&L (reporting). May be negative. NOT spendable.';
