-- Migration 019: Financial Maker-Checker Approval Workflow Ecosystem

CREATE TABLE IF NOT EXISTS maker_checker_requests (
  request_id VARCHAR(64) PRIMARY KEY,
  operation_type VARCHAR(64) NOT NULL, -- MANUAL_CREDIT | MANUAL_DEBIT | WITHDRAWAL_OVERRIDE | REFUND | BONUS_ADJUSTMENT | SETTLEMENT_CORRECTION
  target_user_id VARCHAR(64) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL,
  reason TEXT NOT NULL,
  maker_id VARCHAR(64) NOT NULL,
  checker_id VARCHAR(64),
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING_CHECKER_APPROVAL', -- PENDING_CHECKER_APPROVAL | APPROVED | REJECTED
  rejection_reason TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_maker_checker_status ON maker_checker_requests(status);
CREATE INDEX IF NOT EXISTS idx_maker_checker_user ON maker_checker_requests(target_user_id);
