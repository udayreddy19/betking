-- KYC reminder delivery log (admin-triggered Zoho/SMTP reminders)

CREATE TABLE IF NOT EXISTS kyc_reminder_log (
  reminder_id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  admin_id VARCHAR(64),
  email VARCHAR(255) NOT NULL,
  kyc_status_at_send VARCHAR(32) NOT NULL,
  delivery_status VARCHAR(32) NOT NULL DEFAULT 'QUEUED'
    CHECK (delivery_status IN ('QUEUED', 'SENT', 'FAILED', 'SKIPPED')),
  provider VARCHAR(64),
  message_id VARCHAR(255),
  error_message TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  idempotency_key VARCHAR(128),
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kyc_reminder_idempotency
  ON kyc_reminder_log (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_kyc_reminder_user_created
  ON kyc_reminder_log (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_kyc_reminder_retry
  ON kyc_reminder_log (delivery_status, next_retry_at)
  WHERE delivery_status IN ('QUEUED', 'FAILED');
