-- Custom display name when Software Platform mode is ON.
ALTER TABLE product_configuration
  ADD COLUMN IF NOT EXISTS software_platform_name VARCHAR(120);
