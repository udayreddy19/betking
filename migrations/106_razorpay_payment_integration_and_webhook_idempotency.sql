-- Migration 106: Complete Razorpay API + Webhook Payment Integration & Webhook Idempotency
-- 1. Ensure deposits table has integer amount_paise, provider, and paid_at
-- 2. Create payment_webhook_events table for webhook idempotency
-- 3. Add uniqueness constraints on provider_payment_id and provider_event_id

-- 1. EXTEND DEPOSITS TABLE
ALTER TABLE deposits ADD COLUMN IF NOT EXISTS amount_paise BIGINT;
ALTER TABLE deposits ADD COLUMN IF NOT EXISTS provider VARCHAR(32) DEFAULT 'RAZORPAY';
ALTER TABLE deposits ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- Backfill amount_paise where null
UPDATE deposits SET amount_paise = ROUND(amount * 100) WHERE amount_paise IS NULL;

-- 2. CREATE PAYMENT_WEBHOOK_EVENTS TABLE
CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id SERIAL PRIMARY KEY,
  provider VARCHAR(32) NOT NULL DEFAULT 'RAZORPAY',
  provider_event_id VARCHAR(128) UNIQUE NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  payload_hash VARCHAR(64),
  status VARCHAR(32) NOT NULL DEFAULT 'PROCESSED',
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_wh_provider_event ON payment_webhook_events(provider, provider_event_id);
CREATE INDEX IF NOT EXISTS idx_payment_wh_created ON payment_webhook_events(created_at DESC);

-- 3. UNIQUE INDEX ON PAID PAYMENT_ID TO PREVENT DUPLICATE WALLET CREDITS
CREATE UNIQUE INDEX IF NOT EXISTS idx_deposits_paid_payment_id_unique
  ON deposits(payment_id)
  WHERE status IN ('PAID', 'CAPTURED') AND payment_id IS NOT NULL;

-- 4. EXTEND TRANSACTIONS TABLE INDEXES
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_provider_payment_unique
  ON transactions(provider_payment_id)
  WHERE provider_payment_id IS NOT NULL AND status IN ('SUCCESS', 'COMPLETED');
