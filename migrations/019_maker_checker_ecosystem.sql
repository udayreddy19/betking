-- Migration 019: Financial Maker-Checker Approval Workflow Ecosystem
-- Table maker_checker_requests already exists from 006 (id, action_type, target_entity_*).
-- Add optional columns used by later financial-request payloads without replacing the table.

ALTER TABLE maker_checker_requests ADD COLUMN IF NOT EXISTS request_id VARCHAR(64);
ALTER TABLE maker_checker_requests ADD COLUMN IF NOT EXISTS target_user_id VARCHAR(64);
ALTER TABLE maker_checker_requests ADD COLUMN IF NOT EXISTS amount NUMERIC(12, 2);
ALTER TABLE maker_checker_requests ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE maker_checker_requests ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE maker_checker_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

UPDATE maker_checker_requests
SET request_id = id
WHERE request_id IS NULL;

UPDATE maker_checker_requests
SET target_user_id = target_entity_id
WHERE target_user_id IS NULL AND target_entity_type = 'user';

CREATE INDEX IF NOT EXISTS idx_maker_checker_status ON maker_checker_requests(status);
CREATE INDEX IF NOT EXISTS idx_maker_checker_user ON maker_checker_requests(target_user_id);
