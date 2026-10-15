-- PG compliance / payment-gateway review mode (SwitchP-parity).
-- When ON: betting surfaces are suppressed; wallet/payment gateways stay available
-- for PG review under software-business framing.

ALTER TABLE product_configuration
  ADD COLUMN IF NOT EXISTS pg_review_mode BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE product_configuration_history
  ADD COLUMN IF NOT EXISTS pg_review_mode BOOLEAN,
  ADD COLUMN IF NOT EXISTS previous_pg_review_mode BOOLEAN;
