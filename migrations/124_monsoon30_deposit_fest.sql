-- Seasonal Monsoon Deposit Fest — 30% deposit bonus (MONSOON30).
-- Window: 8 Sep 2026 00:01 IST → 21 Sep 2026 23:59 IST.

INSERT INTO promotions (
  id, name, code, type, status, budget, used_budget, max_reward, per_user_limit,
  min_odds, min_stake, wagering_multiplier, match_percent, starts_at, expires_at
) VALUES (
  'promo_monsoon30',
  'Monsoon Deposit Fest — 30% bonus',
  'MONSOON30',
  'DEPOSIT_BONUS',
  'ACTIVE',
  1500000.00,
  0.00,
  5000.00,
  1,
  1.75,
  2000.00,
  5.0,
  30.00,
  TIMESTAMPTZ '2026-09-08 00:01:00+05:30',
  TIMESTAMPTZ '2026-09-21 23:59:00+05:30'
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  status = EXCLUDED.status,
  budget = EXCLUDED.budget,
  max_reward = EXCLUDED.max_reward,
  per_user_limit = EXCLUDED.per_user_limit,
  min_odds = EXCLUDED.min_odds,
  min_stake = EXCLUDED.min_stake,
  wagering_multiplier = EXCLUDED.wagering_multiplier,
  match_percent = EXCLUDED.match_percent,
  starts_at = EXCLUDED.starts_at,
  expires_at = EXCLUDED.expires_at;
