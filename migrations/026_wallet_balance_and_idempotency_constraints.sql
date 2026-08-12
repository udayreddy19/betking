-- Migration 026: Phase 1 Foundation & Financial Hardening Constraints
-- 1. Database-level Non-Negative Wallet Balance Constraint
-- 2. Idempotency Keys User Isolation & Foreign Key Enhancements

-- 1. ENFORCE NON-NEGATIVE WALLET BALANCE CONSTRAINT SAFELY
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_positive_balance'
    ) THEN
        ALTER TABLE wallets ADD CONSTRAINT check_positive_balance CHECK (balance >= 0.00);
    END IF;
END $$;

-- 2. ADD USER_ID & COMPOSITE INDEX TO IDEMPOTENCY KEYS
ALTER TABLE idempotency_keys ADD COLUMN IF NOT EXISTS user_id VARCHAR(64);
CREATE INDEX IF NOT EXISTS idx_idempotency_user ON idempotency_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_idempotency_key_user ON idempotency_keys(key, user_id);
