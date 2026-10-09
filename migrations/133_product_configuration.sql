-- Product configuration: Admin-controlled Wallet / Betting product toggles.
-- Disabling a product means ACCESS OFF — never deletes historical data.
-- Defaults: both ON (safe for existing OddsYra environments).

CREATE TABLE IF NOT EXISTS product_configuration (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  wallet_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  betting_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by VARCHAR(128),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO product_configuration (id, wallet_enabled, betting_enabled)
VALUES (1, TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS product_configuration_history (
  id BIGSERIAL PRIMARY KEY,
  wallet_enabled BOOLEAN NOT NULL,
  betting_enabled BOOLEAN NOT NULL,
  previous_wallet_enabled BOOLEAN,
  previous_betting_enabled BOOLEAN,
  action VARCHAR(64) NOT NULL,
  reason TEXT,
  changed_by VARCHAR(128),
  correlation_id VARCHAR(128),
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_configuration_history_created
  ON product_configuration_history (created_at DESC);
