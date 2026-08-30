-- 105_discrete_rewards_and_exact_stake_engine.sql
-- Discrete Reward Instruments: Free Bets and Bonus Credits
-- Enforces discrete rewards, exact stake rules, atomic state transitions, and an immutable audit ledger.

CREATE TABLE IF NOT EXISTS user_rewards (
  reward_id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  reward_type VARCHAR(16) NOT NULL CHECK (reward_type IN ('freebet', 'bonus')),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  status VARCHAR(16) NOT NULL DEFAULT 'AVAILABLE'
    CHECK (status IN ('AVAILABLE', 'RESERVED', 'CONSUMED', 'EXPIRED', 'CANCELLED', 'REVERSED')),
  title VARCHAR(128) NOT NULL,
  source VARCHAR(64) NOT NULL DEFAULT 'PROMOTION',
  promotion_id VARCHAR(64),
  min_odds NUMERIC(6,2) DEFAULT 1.00,
  max_odds NUMERIC(6,2),
  allowed_sports JSONB DEFAULT '[]'::jsonb,
  allowed_markets JSONB DEFAULT '[]'::jsonb,
  single_only BOOLEAN DEFAULT false,
  accumulator_allowed BOOLEAN DEFAULT true,
  returns_stake BOOLEAN DEFAULT false,
  allow_partial_use BOOLEAN DEFAULT false,
  used_bet_id VARCHAR(64),
  used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_rewards_user_status
  ON user_rewards(user_id, status, expires_at);

CREATE INDEX IF NOT EXISTS idx_user_rewards_expires
  ON user_rewards(status, expires_at);

CREATE INDEX IF NOT EXISTS idx_user_rewards_used_bet
  ON user_rewards(used_bet_id);

-- Immutable Ledger for all Reward Lifecycle Events
CREATE TABLE IF NOT EXISTS reward_ledger (
  event_id VARCHAR(64) PRIMARY KEY,
  reward_id VARCHAR(64) NOT NULL REFERENCES user_rewards(reward_id) ON DELETE CASCADE,
  user_id VARCHAR(64) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  bet_id VARCHAR(64),
  amount NUMERIC(14,2) NOT NULL,
  event_type VARCHAR(32) NOT NULL
    CHECK (event_type IN ('REWARD_ISSUED', 'REWARD_RESERVED', 'REWARD_CONSUMED', 'REWARD_EXPIRED', 'REWARD_CANCELLED', 'REWARD_REVERSED', 'EXPIRY_EXTENDED')),
  previous_status VARCHAR(16),
  new_status VARCHAR(16) NOT NULL,
  notes TEXT,
  admin_id VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reward_ledger_reward
  ON reward_ledger(reward_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reward_ledger_user
  ON reward_ledger(user_id, created_at DESC);

-- Extend bets table to link exact reward and track stake return policy
ALTER TABLE bets
  ADD COLUMN IF NOT EXISTS reward_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS returns_stake BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_bets_reward_id
  ON bets(reward_id);
