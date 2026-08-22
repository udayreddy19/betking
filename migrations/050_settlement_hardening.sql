-- Migration 050: Ball-by-ball events, settlement queue, and settlement audit events.

CREATE TABLE IF NOT EXISTS match_ball_events (
  event_id VARCHAR(128) PRIMARY KEY,
  canonical_match_id VARCHAR(128) NOT NULL,
  innings INT NOT NULL DEFAULT 1,
  over_number INT NOT NULL,
  ball_number INT NOT NULL,
  sequence_number BIGINT NOT NULL,
  event_type VARCHAR(32) NOT NULL,
  runs INT NOT NULL DEFAULT 0,
  batter_runs INT NOT NULL DEFAULT 0,
  extras INT NOT NULL DEFAULT 0,
  wicket BOOLEAN NOT NULL DEFAULT FALSE,
  wicket_type VARCHAR(32),
  is_boundary BOOLEAN NOT NULL DEFAULT FALSE,
  is_confirmed BOOLEAN NOT NULL DEFAULT TRUE,
  provider VARCHAR(64),
  provider_event_id VARCHAR(128),
  state_version INT,
  raw_label VARCHAR(16),
  occurred_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  superseded_by VARCHAR(128)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_match_ball_events_slot
  ON match_ball_events (canonical_match_id, innings, over_number, ball_number)
  WHERE superseded_by IS NULL AND is_confirmed = TRUE;

CREATE INDEX IF NOT EXISTS idx_match_ball_events_match_seq
  ON match_ball_events (canonical_match_id, sequence_number);

CREATE TABLE IF NOT EXISTS settlement_jobs (
  job_id VARCHAR(128) PRIMARY KEY,
  bet_id VARCHAR(128) NOT NULL,
  match_id VARCHAR(128) NOT NULL,
  market_id VARCHAR(256),
  market_instance_key VARCHAR(256),
  trigger_event_id VARCHAR(128),
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  last_error TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_settlement_jobs_bet_trigger
  ON settlement_jobs (bet_id, COALESCE(trigger_event_id, 'manual'));

CREATE INDEX IF NOT EXISTS idx_settlement_jobs_pending
  ON settlement_jobs (status, scheduled_at)
  WHERE status IN ('PENDING', 'RETRY');

CREATE TABLE IF NOT EXISTS settlement_events (
  id VARCHAR(128) PRIMARY KEY,
  bet_id VARCHAR(128) NOT NULL,
  user_id VARCHAR(128) NOT NULL,
  match_id VARCHAR(128),
  market_id VARCHAR(256),
  selection_id VARCHAR(256),
  market_type VARCHAR(64),
  result VARCHAR(32) NOT NULL,
  stake NUMERIC(14,2),
  odds NUMERIC(10,4),
  payout NUMERIC(14,2),
  settlement_reason TEXT,
  settlement_rule VARCHAR(64),
  provider VARCHAR(64),
  provider_event_id VARCHAR(128),
  state_version INT,
  settlement_version INT NOT NULL DEFAULT 1,
  engine_version VARCHAR(16) NOT NULL DEFAULT '1.0',
  settled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_settlement_events_bet_version
  ON settlement_events (bet_id, settlement_version);

CREATE INDEX IF NOT EXISTS idx_settlement_events_bet_time
  ON settlement_events (bet_id, settled_at DESC);

CREATE TABLE IF NOT EXISTS settlement_corrections (
  correction_id VARCHAR(128) PRIMARY KEY,
  bet_id VARCHAR(128) NOT NULL,
  prior_result VARCHAR(32) NOT NULL,
  new_result VARCHAR(32),
  prior_payout NUMERIC(14,2),
  adjustment_amount NUMERIC(14,2),
  provider_event_id VARCHAR(128),
  state_version INT,
  status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_settlement_corrections_bet
  ON settlement_corrections (bet_id, created_at DESC);
