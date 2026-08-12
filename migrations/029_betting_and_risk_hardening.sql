-- Migration 029: Phase 5 Betting & Risk Engine Production Hardening
-- 1. Extend bets table with market_id, bet_type, accepted_at, accepted_odds, potential_profit, idempotency_key, odds_version
-- 2. Create bet_selections table for accumulator/multiples validation
-- 3. Add composite indexes for bet lookups and idempotency validation

-- 1. EXTEND BETS TABLE
ALTER TABLE bets ADD COLUMN IF NOT EXISTS market_id VARCHAR(64);
ALTER TABLE bets ADD COLUMN IF NOT EXISTS bet_type VARCHAR(32) DEFAULT 'SINGLE';
ALTER TABLE bets ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE bets ADD COLUMN IF NOT EXISTS accepted_odds NUMERIC(8,2);
ALTER TABLE bets ADD COLUMN IF NOT EXISTS potential_profit NUMERIC(14,2);
ALTER TABLE bets ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128);
ALTER TABLE bets ADD COLUMN IF NOT EXISTS odds_version INT DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_bets_user_status ON bets(user_id, status);
CREATE INDEX IF NOT EXISTS idx_bets_idempotency ON bets(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 2. CREATE BET_SELECTIONS TABLE
CREATE TABLE IF NOT EXISTS bet_selections (
  id VARCHAR(64) PRIMARY KEY,
  bet_id VARCHAR(64) NOT NULL REFERENCES bets(bet_id) ON DELETE CASCADE,
  match_id VARCHAR(64) NOT NULL,
  market_id VARCHAR(64) NOT NULL,
  selection_id VARCHAR(64) NOT NULL,
  selection_name VARCHAR(128),
  odds NUMERIC(8,2) NOT NULL,
  status VARCHAR(32) DEFAULT 'PENDING',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bet_selections_bet_id ON bet_selections(bet_id);
