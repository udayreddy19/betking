-- Migration 003: Production Hardening, Idempotency & Financial Integrity Constraints

-- 1. PERSISTENT IDEMPOTENCY KEYS TABLE
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key VARCHAR(255) PRIMARY KEY,
  operation_type VARCHAR(64) NOT NULL,
  request_hash VARCHAR(128),
  status VARCHAR(32) NOT NULL DEFAULT 'PROCESSING', -- PROCESSING | COMPLETED | FAILED
  result JSONB,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_idempotency_status ON idempotency_keys(key, status);

-- 2. SETTLEMENTS AUDIT TABLE WITH UNIQUE CONSTRAINT (DOUBLE SETTLEMENT PROTECTION)
CREATE TABLE IF NOT EXISTS settlements (
  settlement_id VARCHAR(64) PRIMARY KEY,
  match_id VARCHAR(64) NOT NULL REFERENCES matches(match_id),
  selection_id VARCHAR(64) NOT NULL REFERENCES selections(selection_id),
  winning_selection_id VARCHAR(64) NOT NULL,
  settled_by VARCHAR(64) DEFAULT 'SYSTEM_SETTLEMENT_WORKER',
  bets_settled_count INT DEFAULT 0,
  total_payout_amount NUMERIC(14,2) DEFAULT 0.00,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_match_selection_settlement UNIQUE (match_id, selection_id)
);

-- 3. PAYMENT WEBHOOK UNIQUE UTR CONSTRAINT (DUPLICATE WEBHOOK PROTECTION)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_utr ON transactions(utr) WHERE utr IS NOT NULL AND utr != '';

-- 4. FINANCIAL BALANCE NON-NEGATIVE CHECK CONSTRAINT
ALTER TABLE wallets DROP CONSTRAINT IF EXISTS wallets_balance_check;
ALTER TABLE wallets ADD CONSTRAINT wallets_balance_check CHECK (balance >= 0.00);

ALTER TABLE wallets DROP CONSTRAINT IF EXISTS wallets_bonus_check;
ALTER TABLE wallets ADD CONSTRAINT wallets_bonus_check CHECK (bonus_balance >= 0.00);
