-- Persist daily spin prizes and freebet wallet bucket.

ALTER TABLE wallets
  ADD COLUMN IF NOT EXISTS freebet_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wallets_freebet_check'
  ) THEN
    ALTER TABLE wallets ADD CONSTRAINT wallets_freebet_check CHECK (freebet_balance >= 0.00);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS daily_spins (
  spin_id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  spin_date DATE NOT NULL,
  prize_type VARCHAR(16) NOT NULL,
  prize_value NUMERIC(14,2) NOT NULL,
  prize_index INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, spin_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_spins_user_date ON daily_spins(user_id, spin_date);
