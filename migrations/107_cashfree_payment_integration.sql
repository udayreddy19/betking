-- Migration 107: Cashfree Payments API + Webhook Integration & Multi-Provider Support
-- 1. Extend deposits table for Cashfree session tracking and provider order mappings
-- 2. Ensure payment_webhook_events index covers multi-provider lookup
-- 3. Add indexes for high-throughput provider order lookup

-- 1. EXTEND DEPOSITS TABLE
ALTER TABLE deposits ADD COLUMN IF NOT EXISTS payment_session_id VARCHAR(255);
ALTER TABLE deposits ADD COLUMN IF NOT EXISTS cf_order_id VARCHAR(128);
ALTER TABLE deposits ADD COLUMN IF NOT EXISTS cf_payment_id VARCHAR(128);

-- Add index on deposits by provider and order_id
CREATE INDEX IF NOT EXISTS idx_deposits_provider_order ON deposits(provider, order_id);
CREATE INDEX IF NOT EXISTS idx_deposits_cf_order ON deposits(cf_order_id) WHERE cf_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deposits_payment_session ON deposits(payment_session_id) WHERE payment_session_id IS NOT NULL;

-- 2. EXTEND PAYMENT WEBHOOK EVENTS TABLE
CREATE INDEX IF NOT EXISTS idx_payment_webhook_provider_status ON payment_webhook_events(provider, status);
