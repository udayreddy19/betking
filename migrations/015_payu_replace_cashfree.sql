-- Replace Cashfree gateway slot with PayU Hosted Checkout

ALTER TABLE payment_gateway_configs
  DROP CONSTRAINT IF EXISTS payment_gateway_configs_provider_check;

-- Keep existing row id; only swap provider label so toggles stay attached
UPDATE payment_gateway_configs
SET provider = 'PAYU',
    environment = CASE
      WHEN LOWER(environment) IN ('sandbox', 'test', 'uat') THEN 'test'
      ELSE 'production'
    END,
    updated_at = NOW()
WHERE provider = 'CASHFREE';

INSERT INTO payment_gateway_configs (
  id, provider, enabled, is_primary, environment, allow_user_selection, health_status
) VALUES
  ('gw_payu', 'PAYU', FALSE, FALSE, 'production', FALSE, 'UNKNOWN')
ON CONFLICT (provider) DO NOTHING;

ALTER TABLE payment_gateway_configs
  ADD CONSTRAINT payment_gateway_configs_provider_check
  CHECK (provider IN ('RAZORPAY', 'PAYU', 'PINELABS'));
