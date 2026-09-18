-- 130: Ops money-path alerts + UPI beneficiary verification store

INSERT INTO ops_alert_rules (rule_id, rule_key, title, category, severity, threshold_count, window_seconds, cooldown_seconds, enabled)
VALUES
  ('oar_deposit_fail', 'DEPOSIT_FAILURE_SPIKE', 'Deposit failure spike', 'PAYMENTS', 'HIGH', 5, 300, 600, TRUE),
  ('oar_referral_play', 'REFERRAL_PLAY_SPIKE', 'Referral play commission spike', 'GROWTH', 'WARNING', 50, 900, 900, TRUE),
  ('oar_srl_toss_auto', 'SRL_TOSS_AUTO_LOCK', 'SRL toss auto-locked without desk', 'SRL', 'WARNING', 1, 3600, 300, TRUE),
  ('oar_wallet_mismatch', 'WALLET_LEDGER_MISMATCH', 'Open wallet/ledger discrepancies', 'FINANCE', 'CRITICAL', 1, 3600, 1800, TRUE)
ON CONFLICT (rule_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS upi_beneficiary_verifications (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  vpa VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'VERIFIED', 'FAILED', 'SIMULATED', 'SKIPPED')),
  provider VARCHAR(32) DEFAULT 'internal',
  beneficiary_name VARCHAR(255),
  amount_paise INT DEFAULT 0,
  reference_id VARCHAR(128),
  raw_response JSONB DEFAULT '{}'::jsonb,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS unq_upi_vpa_user_active
  ON upi_beneficiary_verifications (user_id, lower(vpa))
  WHERE status IN ('VERIFIED', 'SIMULATED');

CREATE INDEX IF NOT EXISTS idx_upi_verify_user ON upi_beneficiary_verifications (user_id, created_at DESC);
