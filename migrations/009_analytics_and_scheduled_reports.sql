-- Migration 009: Business Intelligence, Analytics & Scheduled Reports

-- 1. SCHEDULED REPORTS TABLE
CREATE TABLE IF NOT EXISTS scheduled_reports (
  id VARCHAR(64) PRIMARY KEY,
  report_name VARCHAR(128) NOT NULL,
  report_type VARCHAR(64) NOT NULL, -- DAILY_BETTING | FINANCIAL_LEDGER | RECONCILIATION_AUDIT | FRAUD_SUMMARY
  schedule_cron VARCHAR(32) DEFAULT '0 0 * * *',
  parameters JSONB,
  format VARCHAR(16) DEFAULT 'CSV', -- CSV | JSON | EXCEL | PDF
  recipients JSONB,
  status VARCHAR(32) DEFAULT 'ACTIVE', -- ACTIVE | PAUSED | DISABLED
  last_run_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. ASYNCHRONOUS REPORT EXPORT JOBS TABLE
CREATE TABLE IF NOT EXISTS report_export_jobs (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  report_type VARCHAR(64) NOT NULL,
  format VARCHAR(16) DEFAULT 'CSV',
  status VARCHAR(32) DEFAULT 'PENDING', -- PENDING | PROCESSING | COMPLETED | FAILED
  download_url VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_export_jobs_user ON report_export_jobs(user_id, status);

-- 3. PERFORMANCE INDEXES FOR ANALYTICS AGGREGATIONS
CREATE INDEX IF NOT EXISTS idx_bets_analytics_created ON bets(created_at, status);
CREATE INDEX IF NOT EXISTS idx_ledger_analytics_created ON ledger_entries(created_at, type);
CREATE INDEX IF NOT EXISTS idx_tx_analytics_type ON transactions(type, status, created_at);
