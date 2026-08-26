-- Payment refunds (Razorpay) — idempotent, ledger-backed reversals of captured deposits.
CREATE TABLE IF NOT EXISTS payment_refunds (
  refund_id VARCHAR(64) PRIMARY KEY,
  deposit_id VARCHAR(64) NOT NULL REFERENCES deposits(deposit_id),
  user_id VARCHAR(64) NOT NULL REFERENCES users(user_id),
  provider_payment_id VARCHAR(128) NOT NULL,
  provider_refund_id VARCHAR(128),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(8) NOT NULL DEFAULT 'INR',
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED')),
  reason TEXT,
  actor_id VARCHAR(64),
  idempotency_key VARCHAR(128) NOT NULL,
  transaction_id VARCHAR(128),
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_refunds_provider_refund
  ON payment_refunds(provider_refund_id)
  WHERE provider_refund_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_refunds_deposit ON payment_refunds(deposit_id);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_user ON payment_refunds(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_payment ON payment_refunds(provider_payment_id);

ALTER TABLE deposits ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
