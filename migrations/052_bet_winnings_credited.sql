-- Track withdrawable winnings credited per settled bet (audit + repair)
ALTER TABLE bets ADD COLUMN IF NOT EXISTS winnings_credited NUMERIC(14,2);
