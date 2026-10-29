-- Retire PayU / Pine Labs from OddsYra checkout.
-- Add HDFC SmartGateway + direct UPI collect (admin-configured VPA).

ALTER TABLE payment_gateway_configs
  DROP CONSTRAINT IF EXISTS payment_gateway_configs_provider_check;

ALTER TABLE payment_gateway_configs
  ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE payment_gateway_configs
   SET enabled = FALSE,
       is_primary = FALSE,
       updated_at = NOW()
 WHERE provider IN ('PAYU', 'PINELABS');

INSERT INTO payment_gateway_configs (
  id, provider, enabled, is_primary, environment, allow_user_selection, health_status, settings, created_at, updated_at
)
VALUES
  ('gw_hdfc', 'HDFC', FALSE, FALSE, 'uat', FALSE, 'UNKNOWN', '{}'::jsonb, NOW(), NOW()),
  ('gw_upi', 'UPI', FALSE, FALSE, 'production', FALSE, 'UNKNOWN', '{}'::jsonb, NOW(), NOW())
ON CONFLICT (provider) DO NOTHING;

-- If PayU/Pinelabs was the only primary, move primary to HDFC (or Razorpay).
UPDATE payment_gateway_configs
   SET is_primary = TRUE, updated_at = NOW()
 WHERE provider = 'HDFC'
   AND NOT EXISTS (
     SELECT 1 FROM payment_gateway_configs WHERE is_primary = TRUE
   );
