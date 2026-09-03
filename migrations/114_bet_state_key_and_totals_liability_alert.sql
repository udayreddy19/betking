-- Persist live match state fingerprint at placement for dispute / audit.
ALTER TABLE bets ADD COLUMN IF NOT EXISTS state_key VARCHAR(160);

CREATE INDEX IF NOT EXISTS idx_bets_state_key
  ON bets (state_key)
  WHERE state_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bets_match_state_key
  ON bets (match_id, state_key)
  WHERE state_key IS NOT NULL;

-- Ops rule: high open liability on totals markets
INSERT INTO ops_alert_rules (
  rule_id, rule_key, title, category, severity,
  threshold_count, window_seconds, cooldown_seconds, enabled
) VALUES (
  'oar_totals_liab',
  'TOTALS_LIABILITY_HIGH',
  'Open totals liability above ₹40k on a match',
  'BETTING',
  'HIGH',
  40000,
  60,
  900,
  TRUE
) ON CONFLICT (rule_key) DO UPDATE
  SET threshold_count = EXCLUDED.threshold_count,
      title = EXCLUDED.title,
      enabled = TRUE,
      updated_at = NOW();
