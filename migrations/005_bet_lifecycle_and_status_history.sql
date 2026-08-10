-- Migration 005: Bet Status History & Account Restrictions Management

-- 1. BET STATUS HISTORY TABLE
CREATE TABLE IF NOT EXISTS bet_status_history (
  history_id VARCHAR(64) PRIMARY KEY,
  bet_id VARCHAR(64) NOT NULL REFERENCES bets(bet_id) ON DELETE CASCADE,
  from_status VARCHAR(32) NOT NULL,
  to_status VARCHAR(32) NOT NULL,
  reason TEXT,
  actor_id VARCHAR(64) DEFAULT 'SYSTEM',
  correlation_id VARCHAR(128),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bet_history_bet ON bet_status_history(bet_id);

-- 2. ACCOUNT RESTRICTIONS AUDIT TABLE
CREATE TABLE IF NOT EXISTS account_restrictions (
  restriction_id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  type VARCHAR(32) NOT NULL, -- TEMPORARY_SUSPENSION | PERMANENT_RESTRICTION | WITHDRAWAL_HOLD
  reason TEXT NOT NULL,
  status VARCHAR(32) DEFAULT 'ACTIVE', -- ACTIVE | RELEASED | EXPIRED
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_by VARCHAR(64) DEFAULT 'ADMIN',
  released_at TIMESTAMP WITH TIME ZONE,
  released_by VARCHAR(64)
);

CREATE INDEX IF NOT EXISTS idx_acc_restriction_user ON account_restrictions(user_id, status);
