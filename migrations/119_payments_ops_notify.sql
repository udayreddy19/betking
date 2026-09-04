-- Payments ops notify: small-deposit digest buffer + delivery accountability log
CREATE TABLE IF NOT EXISTS payments_ops_digest_items (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'deposit',
  user_id TEXT,
  amount NUMERIC(14, 2) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  flushed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payments_ops_digest_pending
  ON payments_ops_digest_items (created_at)
  WHERE flushed_at IS NULL;

CREATE TABLE IF NOT EXISTS payments_ops_email_log (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  recipient TEXT,
  subject TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_ops_email_log_created
  ON payments_ops_email_log (created_at DESC);
