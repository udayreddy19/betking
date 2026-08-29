-- Phase 33 — Settlement Correction Recovery Liability Tracking
ALTER TABLE settlement_corrections ADD COLUMN IF NOT EXISTS recovered_amount NUMERIC(14,2) DEFAULT 0.00;
ALTER TABLE settlement_corrections ADD COLUMN IF NOT EXISTS outstanding_amount NUMERIC(14,2) DEFAULT 0.00;
CREATE INDEX IF NOT EXISTS idx_settlement_corrections_status ON settlement_corrections (status, created_at DESC);
