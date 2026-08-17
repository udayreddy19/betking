-- Persist BetKing SRL operator desk sessions across restarts
CREATE TABLE IF NOT EXISTS srl_operator_sessions (
  match_id VARCHAR(64) PRIMARY KEY,
  started_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  paused_elapsed_ms BIGINT NOT NULL DEFAULT 0,
  speed NUMERIC(6,2) NOT NULL DEFAULT 1,
  forced_winner_key VARCHAR(32),
  declared_at TIMESTAMPTZ,
  declared_winner_key VARCHAR(32),
  declared_elapsed_ms BIGINT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_srl_operator_sessions_updated
  ON srl_operator_sessions(updated_at DESC);
