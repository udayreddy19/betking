-- Saved bank accounts for Wallet withdrawals (masked display; no full card data).
-- Additive only — does not alter existing withdrawals.bank_details.

CREATE TABLE IF NOT EXISTS user_bank_accounts (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  account_holder_name VARCHAR(128) NOT NULL,
  bank_name VARCHAR(128),
  account_number_last4 VARCHAR(4) NOT NULL,
  account_number_hash VARCHAR(128) NOT NULL,
  ifsc VARCHAR(16) NOT NULL,
  account_type VARCHAR(32) DEFAULT 'SAVINGS',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_bank_accounts_user
  ON user_bank_accounts (user_id)
  WHERE deleted_at IS NULL AND status = 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_bank_accounts_user_hash
  ON user_bank_accounts (user_id, account_number_hash)
  WHERE deleted_at IS NULL;
