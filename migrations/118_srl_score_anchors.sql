-- Persist score anchors so market declares drive the live SRL scoreboard
ALTER TABLE srl_operator_sessions
  ADD COLUMN IF NOT EXISTS score_anchors JSONB NOT NULL DEFAULT '[]'::jsonb;
