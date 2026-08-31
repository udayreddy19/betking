-- Migration 109: Centralized Wallet, Deposit, and Promotional Balance Rules
-- Enforces server-authoritative minimum deposit limits, exact stake rules, and non-partial promotional usage

CREATE TABLE IF NOT EXISTS wallet_promotion_rules (
  id VARCHAR(64) PRIMARY KEY DEFAULT 'default',
  minimum_deposit_amount NUMERIC(12, 2) NOT NULL DEFAULT 1000.00,
  allow_partial_freebet BOOLEAN NOT NULL DEFAULT false,
  allow_partial_bonus BOOLEAN NOT NULL DEFAULT false,
  require_full_freebet_amount BOOLEAN NOT NULL DEFAULT true,
  require_full_bonus_amount BOOLEAN NOT NULL DEFAULT true,
  updated_by VARCHAR(64),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed default configuration
INSERT INTO wallet_promotion_rules (
  id,
  minimum_deposit_amount,
  allow_partial_freebet,
  allow_partial_bonus,
  require_full_freebet_amount,
  require_full_bonus_amount,
  updated_at
)
VALUES (
  'default',
  1000.00,
  false,
  false,
  true,
  true,
  NOW()
)
ON CONFLICT (id) DO NOTHING;
