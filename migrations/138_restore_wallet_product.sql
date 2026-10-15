-- Restore user-facing wallet on OddsYra (header money pill / Add Money / deposits).
-- Previous product-isolation work forced wallet_enabled = FALSE; flip it back once.

ALTER TABLE product_configuration
  ADD COLUMN IF NOT EXISTS wallet_ui_restored BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE product_configuration
SET wallet_enabled = TRUE,
    wallet_ui_restored = TRUE,
    updated_at = NOW(),
    updated_by = COALESCE(NULLIF(updated_by, ''), 'migration_138')
WHERE id = 1
  AND wallet_ui_restored IS DISTINCT FROM TRUE;
