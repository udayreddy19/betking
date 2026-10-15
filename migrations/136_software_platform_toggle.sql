-- Software Platform public-site toggle (also applied idempotently by lib/productConfig.mjs at load time).
ALTER TABLE product_configuration
  ADD COLUMN IF NOT EXISTS software_platform_enabled BOOLEAN NOT NULL DEFAULT FALSE;
