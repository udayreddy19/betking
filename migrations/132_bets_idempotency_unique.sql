-- Unique bet idempotency keys (nullable allowed; non-null must be unique).
CREATE UNIQUE INDEX IF NOT EXISTS idx_bets_idempotency_unique
  ON bets (idempotency_key)
  WHERE idempotency_key IS NOT NULL AND btrim(idempotency_key) <> '';
