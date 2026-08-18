-- Seed production sports promotions + signup promo codes (idempotent).

ALTER TABLE promotions ADD COLUMN IF NOT EXISTS match_percent NUMERIC(6,2);

INSERT INTO promotions (
  id, name, code, type, status, budget, used_budget, max_reward, per_user_limit,
  min_odds, min_stake, wagering_multiplier, match_percent, expires_at
) VALUES
  (
    'promo_welcome150',
    '150% Welcome Sports Bonus up to ₹30,000',
    'WELCOME150',
    'DEPOSIT_BONUS',
    'ACTIVE',
    5000000.00,
    0.00,
    30000.00,
    1,
    1.75,
    100.00,
    5.0,
    150.00,
    NOW() + INTERVAL '365 days'
  ),
  (
    'promo_reload50',
    '50% Weekly Reload up to ₹5,000',
    'RELOAD50',
    'DEPOSIT_BONUS',
    'ACTIVE',
    2000000.00,
    0.00,
    5000.00,
    1,
    1.75,
    100.00,
    5.0,
    50.00,
    NOW() + INTERVAL '180 days'
  ),
  (
    'promo_cricket_boost',
    'Cricket Multi Boost — 25% extra on 3+ leg accas',
    'CRICKET25',
    'FREE_BET',
    'ACTIVE',
    750000.00,
    0.00,
    2500.00,
    1,
    1.75,
    200.00,
    5.0,
    NULL,
    NOW() + INTERVAL '120 days'
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
  expires_at = EXCLUDED.expires_at;

INSERT INTO signup_promo_codes (
  code_id, code, name, reward_type, amount, is_active, max_redemptions, max_per_user
) VALUES
  (
    'spc_sports500',
    'SPORTS500',
    '₹500 Free Bet for New Players',
    'freebet',
    500.00,
    TRUE,
    25000,
    1
  ),
  (
    'spc_live100',
    'LIVE100',
    '₹100 Live Betting Free Bet',
    'freebet',
    100.00,
    TRUE,
    NULL,
    1
  ),
  (
    'spc_vip1000',
    'VIP1000',
    '₹1,000 VIP Welcome Bonus',
    'bonus',
    1000.00,
    TRUE,
    5000,
    1
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  reward_type = EXCLUDED.reward_type,
  amount = EXCLUDED.amount,
  is_active = EXCLUDED.is_active,
  max_redemptions = EXCLUDED.max_redemptions,
  max_per_user = EXCLUDED.max_per_user,
  updated_at = CURRENT_TIMESTAMP;
