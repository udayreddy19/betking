-- Migration 056: Database-level uniqueness constraint for provider events
CREATE UNIQUE INDEX IF NOT EXISTS idx_match_ball_events_provider_native
  ON match_ball_events (provider, provider_event_id)
  WHERE provider IS NOT NULL AND provider_event_id IS NOT NULL;
