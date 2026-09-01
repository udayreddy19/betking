-- SRL desk: close betting per match + persist season clock offset
ALTER TABLE srl_operator_sessions
  ADD COLUMN IF NOT EXISTS betting_closed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS srl_operator_settings (
  key TEXT PRIMARY KEY,
  value_num BIGINT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
