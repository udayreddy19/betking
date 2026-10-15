-- Snapshot native product flags when Software Platform is enabled (restored on disable).
ALTER TABLE product_configuration
  ADD COLUMN IF NOT EXISTS pre_software_betting_enabled BOOLEAN,
  ADD COLUMN IF NOT EXISTS pre_software_pg_review_mode BOOLEAN;
