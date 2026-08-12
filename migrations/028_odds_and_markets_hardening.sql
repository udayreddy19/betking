-- Migration 028: Phase 4 Odds and Markets Hardening
-- 1. Extend markets table with audit timestamps, suspension reason, margin, provider info, and index (match_id, status)
-- 2. Extend selections table with versioning, timestamps, implied probability, and index (market_id, status)
-- 3. Create market_suspensions table for multi-cause suspension tracking

-- 1. EXTEND MARKETS TABLE
ALTER TABLE markets ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS settled_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS suspension_reason TEXT;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS provider_id VARCHAR(64);
ALTER TABLE markets ADD COLUMN IF NOT EXISTS margin NUMERIC(6,4);

CREATE INDEX IF NOT EXISTS idx_markets_match_status ON markets(match_id, status);

-- 2. EXTEND SELECTIONS TABLE
ALTER TABLE selections ADD COLUMN IF NOT EXISTS provider_selection_id VARCHAR(128);
ALTER TABLE selections ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE selections ADD COLUMN IF NOT EXISTS odds_version INT DEFAULT 1;
ALTER TABLE selections ADD COLUMN IF NOT EXISTS implied_probability NUMERIC(6,4);

CREATE INDEX IF NOT EXISTS idx_selections_market_status ON selections(market_id, status);

-- 3. CREATE MARKET_SUSPENSIONS TABLE FOR MULTI-CAUSE SUSPENSION
CREATE TABLE IF NOT EXISTS market_suspensions (
  id VARCHAR(64) PRIMARY KEY,
  market_id VARCHAR(64) NOT NULL REFERENCES markets(market_id) ON DELETE CASCADE,
  reason VARCHAR(64) NOT NULL,
  source VARCHAR(32) NOT NULL DEFAULT 'SYSTEM', -- 'SYSTEM' | 'EVENT' | 'ADMIN' | 'PROVIDER' | 'RISK'
  actor VARCHAR(64),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  cleared_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_market_suspensions_active ON market_suspensions(market_id) WHERE cleared_at IS NULL;
