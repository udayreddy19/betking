-- 071: Phase 3 product hardening — marketing preference audit (additive)
-- Reuses user_notification_preferences (migration 011). Does NOT create a duplicate prefs table.

ALTER TABLE user_notification_preferences
  ADD COLUMN IF NOT EXISTS source VARCHAR(64) DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS updated_by VARCHAR(64);

CREATE TABLE IF NOT EXISTS marketing_preference_events (
  event_id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  channel VARCHAR(32) NOT NULL,
  previous_value BOOLEAN,
  new_value BOOLEAN NOT NULL,
  source VARCHAR(64) DEFAULT 'user',
  actor_id VARCHAR(64),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mkt_pref_events_user
  ON marketing_preference_events (user_id, created_at DESC);
