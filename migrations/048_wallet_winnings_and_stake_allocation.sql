-- Track withdrawable winnings and locked deposits separately from playable cash.
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS winnings_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00;
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS locked_deposit_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00;

DO $$ BEGIN
  ALTER TABLE wallets ADD CONSTRAINT check_winnings_balance_non_negative CHECK (winnings_balance >= 0.00);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE wallets ADD CONSTRAINT check_locked_deposit_balance_non_negative CHECK (locked_deposit_balance >= 0.00);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Remember how a cash stake was funded so void refunds restore the right buckets.
ALTER TABLE bets ADD COLUMN IF NOT EXISTS stake_from_locked NUMERIC(14,2) NOT NULL DEFAULT 0.00;
ALTER TABLE bets ADD COLUMN IF NOT EXISTS stake_from_winnings NUMERIC(14,2) NOT NULL DEFAULT 0.00;
ALTER TABLE bets ADD COLUMN IF NOT EXISTS stake_from_cash NUMERIC(14,2) NOT NULL DEFAULT 0.00;
