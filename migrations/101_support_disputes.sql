-- Migration 101: Customer Support & Bet Dispute Center

CREATE TABLE IF NOT EXISTS bet_disputes (
  id VARCHAR(64) PRIMARY KEY,
  dispute_id VARCHAR(64) UNIQUE,
  bet_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(32) DEFAULT 'OPEN', -- OPEN, IN_REVIEW, RESOLVED_UPHELD, RESOLVED_REFUNDED, REJECTED
  assigned_agent_id VARCHAR(64),
  resolution_notes TEXT,
  refund_amount NUMERIC(12,2) DEFAULT 0.00,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_bet_disputes_user ON bet_disputes (user_id, status);
CREATE INDEX IF NOT EXISTS idx_bet_disputes_bet ON bet_disputes (bet_id);
