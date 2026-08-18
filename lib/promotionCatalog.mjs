/** Public promotion catalog — merges DB promos + signup codes with display metadata. */

const DISPLAY_BY_CODE = {
  WELCOME150: {
    tag: 'NEW PLAYERS',
    subtitle: '150% match on your first sports deposit',
    description: 'Deposit via UPI and get 150% extra bonus up to ₹30,000. Bet at 1.75+ odds and rotate 5×. Winnings withdrawable after KYC — not the bonus. Once per Aadhaar/PAN.',
    gradient: 'linear-gradient(135deg, #1e1b4b 0%, #311b92 100%)',
    category: 'sports',
    suggestedDeposit: 2000,
  },
  RELOAD50: {
    tag: 'WEEKLY RELOAD',
    subtitle: '50% reload every week up to ₹5,000',
    description: 'Top up your wallet and get 50% bonus credit up to ₹5,000. Bet at 1.75+ odds and rotate 5×. Once per Aadhaar/PAN.',
    gradient: 'linear-gradient(135deg, #064e3b 0%, #047857 100%)',
    category: 'sports',
    suggestedDeposit: 1000,
  },
  CRICKET25: {
    tag: 'CRICKET',
    subtitle: 'Acca boost for cricket multiples',
    description: 'Build a 3+ leg cricket accumulator at min odds 1.75 and claim up to ₹2,500 bonus credit. Rotate 5×. Once per Aadhaar/PAN.',
    gradient: 'linear-gradient(135deg, #1c2a24 0%, #2a4a38 50%, #e07a2f 160%)',
    category: 'sports',
    suggestedDeposit: 500,
  },
  SPORTS500: {
    tag: 'FREE BET',
    subtitle: 'No deposit required — instant free bet',
    description: 'New to OddsYra? Claim a ₹500 free bet. Play at any odds like cash. Profit only. Once per Aadhaar/PAN.',
    gradient: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
    category: 'sports',
  },
  LIVE100: {
    tag: 'LIVE BETTING',
    subtitle: 'Free bet for in-play markets',
    description: 'Get ₹100 free bet credit for live cricket and football. Play at any odds. Once per Aadhaar/PAN.',
    gradient: 'linear-gradient(135deg, #7f1d1d 0%, #dc2626 100%)',
    category: 'sports',
  },
  VIP1000: {
    tag: 'VIP OFFER',
    subtitle: 'Limited welcome bonus for early members',
    description: 'Enter VIP1000 for ₹1,000 bonus credit. Bet at 1.75+ odds and rotate 5×. Once per Aadhaar/PAN.',
    gradient: 'linear-gradient(135deg, #78350f 0%, #f59e0b 100%)',
    category: 'sports',
  },
};

function displayMeta(code) {
  return DISPLAY_BY_CODE[String(code || '').toUpperCase()] || {};
}

export function mapDepositPromotionRow(row) {
  const meta = displayMeta(row.code);
  return {
    id: row.id,
    code: row.code,
    title: row.name,
    subtitle: meta.subtitle || '',
    description: meta.description || '',
    tag: meta.tag || String(row.type || 'PROMO').replace(/_/g, ' '),
    gradient: meta.gradient || 'linear-gradient(135deg, #163028 0%, #1f8a4c 100%)',
    bgColor: meta.gradient || 'linear-gradient(135deg, #163028 0%, #1f8a4c 100%)',
    category: meta.category || 'sports',
    type: row.type,
    claimType: 'deposit_bonus',
    maxReward: Number(row.max_reward || 0),
    minOdds: Number(row.min_odds || 0),
    minStake: Number(row.min_stake || 0),
    wageringMultiplier: Number(row.wagering_multiplier || 0),
    matchPercent: row.match_percent == null ? null : Number(row.match_percent),
    suggestedDeposit: meta.suggestedDeposit || 1000,
    expiresAt: row.expires_at,
  };
}

export function mapSignupCodeRow(row) {
  const meta = displayMeta(row.code);
  const rewardLabel = row.reward_type === 'freebet'
    ? 'Free bet'
    : row.reward_type === 'cash'
      ? 'Cash'
      : 'Bonus';
  return {
    id: row.code_id,
    code: row.code,
    title: row.name,
    subtitle: meta.subtitle || `${rewardLabel} · Code ${row.code}`,
    description: meta.description || `Claim ${rewardLabel.toLowerCase()} credit with code ${row.code}.`,
    tag: meta.tag || rewardLabel.toUpperCase(),
    gradient: meta.gradient || 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
    bgColor: meta.gradient || 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
    category: meta.category || 'sports',
    type: row.reward_type,
    claimType: 'signup_code',
    rewardType: row.reward_type,
    bonusAmount: Number(row.amount || 0),
    maxRedemptions: row.max_redemptions == null ? null : Number(row.max_redemptions),
    redemptionCount: Number(row.redemption_count || 0),
    maxPerUser: row.max_per_user == null ? 1 : Number(row.max_per_user),
  };
}

export async function listPublicPromotionCatalog() {
  const { query } = await import('../db/pg.js');

  const [promosRes, codesRes] = await Promise.all([
    query(`
      SELECT id, name, code, type, max_reward, min_odds, min_stake, wagering_multiplier,
             match_percent, expires_at
      FROM promotions
      WHERE status = 'ACTIVE'
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
      ORDER BY created_at ASC
    `),
    query(`
      SELECT code_id, code, name, reward_type, amount, max_redemptions, redemption_count, max_per_user
      FROM signup_promo_codes
      WHERE is_active = TRUE
        AND (max_redemptions IS NULL OR redemption_count < max_redemptions)
      ORDER BY created_at ASC
    `),
  ]);

  return [
    ...promosRes.rows.map(mapDepositPromotionRow),
    ...codesRes.rows.map(mapSignupCodeRow),
  ];
}

export { DISPLAY_BY_CODE };
