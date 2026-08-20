-- Migration 046: VIP boost at settlement + persisted market liability

ALTER TABLE bets ADD COLUMN IF NOT EXISTS vip_boost_pct NUMERIC(5,2) DEFAULT 0;

CREATE TABLE IF NOT EXISTS market_selection_liability (
  market_id VARCHAR(128) NOT NULL,
  selection_id VARCHAR(128) NOT NULL,
  net_liability NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_stake NUMERIC(14,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (market_id, selection_id)
);

CREATE INDEX IF NOT EXISTS idx_market_selection_liability_market
  ON market_selection_liability (market_id);
