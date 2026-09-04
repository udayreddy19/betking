-- Per-market operator controls for OddsYra SRL (suspend / declare winning selection)
ALTER TABLE srl_operator_sessions
  ADD COLUMN IF NOT EXISTS market_controls JSONB NOT NULL DEFAULT '{}'::jsonb;
