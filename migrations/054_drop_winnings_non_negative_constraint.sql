-- Migration 054: Allow negative cumulative P&L on winnings_balance (semantics from 053).
ALTER TABLE wallets DROP CONSTRAINT IF EXISTS check_winnings_balance_non_negative;
