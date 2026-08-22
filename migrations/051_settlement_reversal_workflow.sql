-- Migration 051: Extend settlement reversal workflow columns.

ALTER TABLE settlement_corrections ADD COLUMN IF NOT EXISTS requested_by VARCHAR(128);
ALTER TABLE settlement_corrections ADD COLUMN IF NOT EXISTS approved_by VARCHAR(128);
ALTER TABLE settlement_corrections ADD COLUMN IF NOT EXISTS executed_by VARCHAR(128);
ALTER TABLE settlement_corrections ADD COLUMN IF NOT EXISTS reversal_tx_id VARCHAR(128);
ALTER TABLE settlement_corrections ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_settlement_corrections_reversal_tx
  ON settlement_corrections (reversal_tx_id)
  WHERE reversal_tx_id IS NOT NULL;
