-- Recalculate stored VIP tiers after threshold changes (056+ earn-rate update).

UPDATE user_loyalty
SET tier = CASE
  WHEN COALESCE(vip_points, points) >= 50000 THEN 'DIAMOND'
  WHEN COALESCE(vip_points, points) >= 25000 THEN 'PLATINUM'
  WHEN COALESCE(vip_points, points) >= 10000 THEN 'GOLD'
  WHEN COALESCE(vip_points, points) >= 2000 THEN 'SILVER'
  ELSE 'BRONZE'
END;
