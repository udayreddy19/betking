-- 067: Phase 1 financial safety — withdrawal risk + promo abuse alerts
-- Extends withdrawals with risk scoring (does not replace withdrawal engine).
-- Promo abuse alerts reuse fraud-signal style tracking without inventing balances.

ALTER TABLE withdrawals
  ADD COLUMN IF NOT EXISTS risk_score NUMERIC(6,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS risk_level VARCHAR(16) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS risk_signals JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS risk_evaluated_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS risk_decision VARCHAR(16) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS risk_reviewed_by VARCHAR(64) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS risk_review_notes TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_withdrawals_risk_level
  ON withdrawals (risk_level)
  WHERE risk_level IS NOT NULL;

CREATE TABLE IF NOT EXISTS promo_abuse_alerts (
  alert_id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) REFERENCES users(user_id) ON DELETE SET NULL,
  promotion_code VARCHAR(64),
  promotion_id VARCHAR(64),
  rule_key VARCHAR(64) NOT NULL,
  risk_score NUMERIC(6,2) NOT NULL DEFAULT 0,
  risk_level VARCHAR(16) NOT NULL DEFAULT 'MEDIUM',
  signals JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(16) NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED')),
  notes TEXT,
  resolved_by VARCHAR(64),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promo_abuse_alerts_status
  ON promo_abuse_alerts (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_promo_abuse_alerts_user
  ON promo_abuse_alerts (user_id, created_at DESC);
