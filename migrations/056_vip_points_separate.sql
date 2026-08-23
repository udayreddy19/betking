-- Redeemable loyalty points (points) vs lifetime VIP progression (vip_points).
-- Redeeming loyalty must not downgrade VIP tier.

ALTER TABLE user_loyalty
  ADD COLUMN IF NOT EXISTS vip_points NUMERIC(14,2);

UPDATE user_loyalty
SET vip_points = points
WHERE vip_points IS NULL;

ALTER TABLE user_loyalty
  ALTER COLUMN vip_points SET DEFAULT 0.00;
