-- Migration 027: Phase 3 Canonical Sports & Provider Mapping Enhancements
-- 1. Extend provider_entity_mappings with mapping_status
-- 2. Extend provider_health_logs with consecutive_failures & last_event_at
-- 3. Ensure composite indexes for provider deduplication lookups

-- 1. EXTEND PROVIDER_ENTITY_MAPPINGS
ALTER TABLE provider_entity_mappings ADD COLUMN IF NOT EXISTS mapping_status VARCHAR(32) DEFAULT 'MATCHED';
CREATE INDEX IF NOT EXISTS idx_provider_mapping_status ON provider_entity_mappings(mapping_status);

-- 2. EXTEND PROVIDER_HEALTH_LOGS
ALTER TABLE provider_health_logs ADD COLUMN IF NOT EXISTS consecutive_failures INT DEFAULT 0;
ALTER TABLE provider_health_logs ADD COLUMN IF NOT EXISTS last_event_at TIMESTAMP WITH TIME ZONE;
CREATE INDEX IF NOT EXISTS idx_provider_health_name ON provider_health_logs(provider_name);

-- 3. ENSURE DATA_CONFLICTS INDEXES & CANONICAL PROVIDERS SEED
CREATE INDEX IF NOT EXISTS idx_data_conflicts_canonical ON data_conflicts(canonical_entity_id);

INSERT INTO canonical_providers (id, name, priority, status)
VALUES 
  ('cricbuzz', 'Cricbuzz Live Engine', 1, 'HEALTHY'),
  ('espn', 'ESPN Scoreboard API', 2, 'HEALTHY'),
  ('fancode', 'FanCode Live Stream API', 3, 'HEALTHY'),
  ('srl_engine', 'Virtual IPL SRL Simulation Engine', 4, 'HEALTHY')
ON CONFLICT (id) DO NOTHING;
