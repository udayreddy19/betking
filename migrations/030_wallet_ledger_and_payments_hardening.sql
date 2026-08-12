-- Migration 030: Phase 6 Wallet, Ledger & Payments Hardening
-- 1. Extend wallets with reserved_balance for fund holds
-- 2. Extend transactions with provider_payment_id, provider_order_id, utr uniqueness
-- 3. Create deposits table for deposit lifecycle tracking
-- 4. Create withdrawals table for withdrawal lifecycle tracking
-- 5. Create financial_discrepancies table for checksum reconciliation audits

-- 1. EXTEND WALLETS TABLE
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS reserved_balance NUMERIC(14,2) DEFAULT 0.00;
ALTER TABLE wallets ADD CONSTRAINT check_reserved_balance_non_negative CHECK (reserved_balance >= 0.00);

-- 2. EXTEND TRANSACTIONS TABLE
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS provider_payment_id VARCHAR(128);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS provider_order_id VARCHAR(128);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS utr VARCHAR(128);

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_utr_unique ON transactions(utr) WHERE utr IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_payment_id_unique ON transactions(provider_payment_id) WHERE provider_payment_id IS NOT NULL;

-- 3. CREATE DEPOSITS TABLE
CREATE TABLE IF NOT EXISTS deposits (
  id VARCHAR(64) PRIMARY KEY,
  deposit_id VARCHAR(64) UNIQUE NOT NULL,
  user_id VARCHAR(64) NOT NULL REFERENCES users(user_id),
  order_id VARCHAR(128) UNIQUE NOT NULL,
  payment_id VARCHAR(128),
  amount NUMERIC(14,2) NOT NULL,
  currency VARCHAR(8) DEFAULT 'INR',
  status VARCHAR(32) DEFAULT 'CREATED',
  raw_payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_deposits_user ON deposits(user_id);
CREATE INDEX IF NOT EXISTS idx_deposits_order ON deposits(order_id);

-- 4. CREATE WITHDRAWALS TABLE
CREATE TABLE IF NOT EXISTS withdrawals (
  withdrawal_id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(user_id),
  amount NUMERIC(14,2) NOT NULL,
  currency VARCHAR(8) DEFAULT 'INR',
  status VARCHAR(32) DEFAULT 'REQUESTED',
  payout_id VARCHAR(128),
  bank_details JSONB,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);

-- 5. CREATE FINANCIAL_DISCREPANCIES TABLE
CREATE TABLE IF NOT EXISTS financial_discrepancies (
  discrepancy_id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(user_id),
  wallet_id VARCHAR(64),
  type VARCHAR(64) NOT NULL,
  stored_balance NUMERIC(14,2),
  ledger_balance NUMERIC(14,2),
  difference NUMERIC(14,2),
  status VARCHAR(32) DEFAULT 'OPEN',
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_discrepancies_user ON financial_discrepancies(user_id);
CREATE INDEX IF NOT EXISTS idx_discrepancies_status ON financial_discrepancies(status);
