-- Repurpose winnings_balance semantics: cumulative lifetime NET profit/loss (reporting only).
-- Authoritative playable cash remains wallets.balance.
COMMENT ON COLUMN wallets.winnings_balance IS 'Cumulative lifetime net profit/loss from settled bets (reporting). NOT a separate spendable wallet.';
