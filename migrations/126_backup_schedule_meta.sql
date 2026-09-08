-- Backup schedule metadata on backups_log + index for ops UI.
ALTER TABLE backups_log
  ADD COLUMN IF NOT EXISTS trigger_source VARCHAR(32),
  ADD COLUMN IF NOT EXISTS actor VARCHAR(128),
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS error_message TEXT;

CREATE INDEX IF NOT EXISTS idx_backups_log_created_at ON backups_log (created_at DESC);
