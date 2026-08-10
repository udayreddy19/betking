-- Migration 004: Transactional Outbox Pattern & Multi-Domain Reconciliation Cases

-- 1. TRANSACTIONAL OUTBOX EVENTS TABLE
CREATE TABLE IF NOT EXISTS outbox_events (
  id VARCHAR(64) PRIMARY KEY,
  event_type VARCHAR(64) NOT NULL,
  aggregate_type VARCHAR(64) NOT NULL,
  aggregate_id VARCHAR(64) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING', -- PENDING | PROCESSING | PROCESSED | FAILED | DEAD_LETTER
  attempts INT DEFAULT 0,
  available_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  correlation_id VARCHAR(128),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_outbox_status_avail ON outbox_events(status, available_at);
CREATE INDEX IF NOT EXISTS idx_outbox_correlation ON outbox_events(correlation_id);

-- 2. RECONCILIATION CASES TABLE
CREATE TABLE IF NOT EXISTS reconciliation_cases (
  id VARCHAR(64) PRIMARY KEY,
  reconciliation_type VARCHAR(64) NOT NULL, -- FINANCIAL_LEDGER | PAYMENT_PROVIDER | BET_SETTLEMENT | DATA_INTEGRITY
  entity_type VARCHAR(64) NOT NULL,
  entity_id VARCHAR(64) NOT NULL,
  expected_value NUMERIC(14,2) DEFAULT 0.00,
  actual_value NUMERIC(14,2) DEFAULT 0.00,
  difference NUMERIC(14,2) DEFAULT 0.00,
  currency VARCHAR(8) DEFAULT 'INR',
  severity VARCHAR(32) DEFAULT 'HIGH', -- LOW | MEDIUM | HIGH | CRITICAL
  status VARCHAR(32) DEFAULT 'OPEN', -- OPEN | INVESTIGATING | ESCALATED | RESOLVED | IGNORED
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  assigned_to VARCHAR(64) DEFAULT 'UNASSIGNED',
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolution TEXT,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_recon_status_sev ON reconciliation_cases(status, severity);
CREATE INDEX IF NOT EXISTS idx_recon_entity ON reconciliation_cases(entity_type, entity_id);
