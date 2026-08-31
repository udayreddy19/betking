-- Migration 108: Production Payment Gateway Management System
-- Stores dynamic runtime configuration, primary gateway selection, health metrics, and audit controls for Cashfree & Razorpay

CREATE TABLE IF NOT EXISTS payment_gateway_configs (
  id VARCHAR(64) PRIMARY KEY,
  provider VARCHAR(32) NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  environment VARCHAR(32) NOT NULL DEFAULT 'production',
  allow_user_selection BOOLEAN NOT NULL DEFAULT false,
  health_status VARCHAR(32) NOT NULL DEFAULT 'HEALTHY',
  last_health_check TIMESTAMP WITH TIME ZONE,
  last_latency_ms INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure only ONE gateway can be designated as PRIMARY at any given time
CREATE UNIQUE INDEX IF NOT EXISTS unq_primary_gateway
  ON payment_gateway_configs (is_primary)
  WHERE is_primary = true;

-- Seed default gateway configurations if not present
INSERT INTO payment_gateway_configs (
  id, provider, enabled, is_primary, environment, allow_user_selection, health_status, created_at, updated_at
)
VALUES
  ('gw_cashfree', 'CASHFREE', true, true, 'production', false, 'HEALTHY', NOW(), NOW()),
  ('gw_razorpay', 'RAZORPAY', true, false, 'production', false, 'HEALTHY', NOW(), NOW())
ON CONFLICT (provider) DO NOTHING;

-- Performance indexes for deposits provider filtering and lookup
CREATE INDEX IF NOT EXISTS idx_deposits_provider_created ON deposits(provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deposits_provider_status ON deposits(provider, status);
