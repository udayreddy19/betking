-- Migration: Create durable odds observation cold storage
CREATE TABLE IF NOT EXISTS odds_observations (
    observation_id VARCHAR(64) PRIMARY KEY,
    timestamp BIGINT NOT NULL,
    match_id VARCHAR(64) NOT NULL,
    sport VARCHAR(32) NOT NULL,
    league VARCHAR(64),
    market VARCHAR(64) NOT NULL,
    selection VARCHAR(64) NOT NULL,
    match_state JSONB,
    provider_inputs JSONB,
    provider_odds NUMERIC(10, 4),
    provider_consensus NUMERIC(10, 4),
    provider_used VARCHAR(64),
    model_probability NUMERIC(10, 6) NOT NULL,
    blended_probability NUMERIC(10, 6),
    published_odds NUMERIC(10, 4) NOT NULL,
    margin NUMERIC(6, 4) NOT NULL,
    liability_shading NUMERIC(6, 4),
    engine_version VARCHAR(32) NOT NULL DEFAULT '3.0.0',
    model_version VARCHAR(32) NOT NULL DEFAULT 'v3.1-prod',
    parameter_version VARCHAR(64) NOT NULL DEFAULT 'params_v1.0_prod',
    provider_latency_ms INT DEFAULT 0,
    feed_timestamp BIGINT,
    processing_timestamp BIGINT,
    quality_result JSONB,
    previous_odds NUMERIC(10, 4),
    new_odds NUMERIC(10, 4),
    odds_delta NUMERIC(10, 4),
    movement_percent NUMERIC(6, 2),
    suspension_reason VARCHAR(128),
    settled_outcome VARCHAR(16) DEFAULT 'UNKNOWN',
    settled_at BIGINT,
    retention_tier VARCHAR(16) DEFAULT 'HOT',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_odds_obs_match ON odds_observations(match_id);
CREATE INDEX IF NOT EXISTS idx_odds_obs_ts ON odds_observations(timestamp);
CREATE INDEX IF NOT EXISTS idx_odds_obs_sport_market ON odds_observations(sport, market);
CREATE INDEX IF NOT EXISTS idx_odds_obs_model_version ON odds_observations(model_version);
CREATE INDEX IF NOT EXISTS idx_odds_obs_settled ON odds_observations(settled_outcome);
