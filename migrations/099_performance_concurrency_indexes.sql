-- Migration 099: High-Concurrency Performance Indexes
-- Optimizes high-throughput bet lookups, risk scans, and double-entry ledger audits

CREATE INDEX IF NOT EXISTS idx_bets_user_status_created 
ON bets (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bets_match_market_status 
ON bets (match_id, market_id, status);

CREATE INDEX IF NOT EXISTS idx_ledger_wallet_created 
ON ledger_entries (wallet_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ledger_direction_amount 
ON ledger_entries (direction, amount);

CREATE INDEX IF NOT EXISTS idx_risk_signals_severity_status 
ON risk_signals (severity, status, created_at DESC);
